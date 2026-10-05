-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 2026-10b — student names admin-only + working public registration
--
-- Run AFTER migration-2026-10-project-details.sql.
-- ⚠️ COUPLED to the app build: run it, then push/deploy the matching app straight away.
--    (Old app + new SQL still saves projects, but without adviser/student names.)
-- Re-runnable.
--
-- PART 1 — Student names were public.
--   `projects` is SELECT USING (true) for anon (judges and the public pages need titles),
--   so projects.group_members / advisor_name were readable by anyone with the anon key
--   (verified live 2026-10-05). They move to a new table, project_private, that only a
--   school admin can read or write.
--   Why a separate table and not a column REVOKE: Supabase Realtime sends whole rows to
--   any subscriber who passes RLS and does not apply column privileges, so a column
--   REVOKE would still leak names through a realtime subscription. RLS on a separate
--   table is enforced for REST *and* Realtime.
--
-- PART 2 — Public student registration could not work.
--   a) handleRegSubmit() inserted into `projects` as anon, which projects_insert
--      (is_school_admin) always rejected.
--   b) The live registration_submissions table was missing 12 columns the form writes
--      (it was created from schema-v2.sql, not registration-migration.sql).
--   Fix: add the columns, and a SECURITY DEFINER RPC submit_registration(token, form)
--   that validates the registration token and creates the project, its private row and
--   the submission in ONE transaction, numbering under a per-school lock so two
--   simultaneous submissions can never get the same registration number.
--   Direct anonymous INSERT on registration_submissions is then closed.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── PART 1: project_private ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_private (
  project_id    TEXT        NOT NULL,
  school_id     UUID        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  advisor_name  TEXT        NOT NULL DEFAULT '',
  group_members JSONB       NOT NULL DEFAULT '[]',   -- [{"name":"..","grade":".."}]
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, school_id),
  -- Deleting a project deletes its names (removeProject relies on this).
  FOREIGN KEY (project_id, school_id) REFERENCES public.projects(id, school_id) ON DELETE CASCADE
);

ALTER TABLE public.project_private ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_private_select" ON public.project_private;
DROP POLICY IF EXISTS "project_private_insert" ON public.project_private;
DROP POLICY IF EXISTS "project_private_update" ON public.project_private;
DROP POLICY IF EXISTS "project_private_delete" ON public.project_private;
CREATE POLICY "project_private_select" ON public.project_private FOR SELECT USING (is_school_admin(school_id));
CREATE POLICY "project_private_insert" ON public.project_private FOR INSERT WITH CHECK (is_school_admin(school_id));
CREATE POLICY "project_private_update" ON public.project_private FOR UPDATE USING (is_school_admin(school_id));
CREATE POLICY "project_private_delete" ON public.project_private FOR DELETE USING (is_school_admin(school_id));

-- Belt and braces: anon gets no privileges at all on this table.
REVOKE ALL ON public.project_private FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_private TO authenticated;

-- Realtime for multi-screen admins. RLS above is enforced for realtime too.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'project_private') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.project_private;
  END IF;
END $$;

-- Copy existing names off `projects`, then drop the public columns.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'group_members') THEN
    INSERT INTO public.project_private (project_id, school_id, advisor_name, group_members)
    SELECT p.id, p.school_id, COALESCE(p.advisor_name, ''), COALESCE(p.group_members, '[]'::jsonb)
    FROM public.projects p
    WHERE COALESCE(p.advisor_name, '') <> '' OR COALESCE(p.group_members, '[]'::jsonb) <> '[]'::jsonb
    ON CONFLICT (project_id, school_id) DO NOTHING;

    ALTER TABLE public.projects DROP COLUMN IF EXISTS group_members;
    ALTER TABLE public.projects DROP COLUMN IF EXISTS advisor_name;
  END IF;
END $$;

-- ── PART 2a: registration_submissions columns the form writes ────────────────
ALTER TABLE public.registration_submissions ADD COLUMN IF NOT EXISTS contact_number     TEXT    NOT NULL DEFAULT '';
ALTER TABLE public.registration_submissions ADD COLUMN IF NOT EXISTS project_type       TEXT    NOT NULL DEFAULT 'Individual';
ALTER TABLE public.registration_submissions ADD COLUMN IF NOT EXISTS advisor_email      TEXT    NOT NULL DEFAULT '';
ALTER TABLE public.registration_submissions ADD COLUMN IF NOT EXISTS school_department  TEXT    NOT NULL DEFAULT '';
ALTER TABLE public.registration_submissions ADD COLUMN IF NOT EXISTS description        TEXT    NOT NULL DEFAULT '';
ALTER TABLE public.registration_submissions ADD COLUMN IF NOT EXISTS needs_electricity  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.registration_submissions ADD COLUMN IF NOT EXISTS special_equipment  TEXT    NOT NULL DEFAULT '';
ALTER TABLE public.registration_submissions ADD COLUMN IF NOT EXISTS has_trifold        BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.registration_submissions ADD COLUMN IF NOT EXISTS is_original_work   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.registration_submissions ADD COLUMN IF NOT EXISTS agrees_to_rules    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.registration_submissions ADD COLUMN IF NOT EXISTS guardian_name      TEXT    NOT NULL DEFAULT '';
ALTER TABLE public.registration_submissions ADD COLUMN IF NOT EXISTS guardian_signature TEXT    NOT NULL DEFAULT '';

-- ── PART 2b: submit_registration RPC ─────────────────────────────────────────
-- p_form keys (all strings unless noted):
--   student_name, grade_level, division, school_name, student_email, contact_number,
--   project_title, category, project_type, group_members (array of names), advisor_name,
--   advisor_email, school_department, description, research_question, hypothesis,
--   special_equipment, guardian_name, guardian_signature, reg_prefix ("JHS-PMA"),
--   needs_electricity / has_trifold / is_original_work / agrees_to_rules (booleans)
-- Returns { reg_number, project_id, project_num }.
CREATE OR REPLACE FUNCTION public.submit_registration(p_token TEXT, p_form JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link     registration_links%ROWTYPE;
  v_sid      UUID;
  v_count    INT;
  v_num      INT;
  v_reg      TEXT;
  v_pid      TEXT;
  v_pnum     TEXT;
  v_prefix   TEXT;
  v_members  JSONB;
  v_names    TEXT;
  -- Trim + cap a text field from the form.
  f_name     TEXT := left(btrim(COALESCE(p_form->>'student_name', '')), 120);
  f_grade    TEXT := left(btrim(COALESCE(p_form->>'grade_level', '')), 20);
  f_division TEXT := left(btrim(COALESCE(p_form->>'division', '')), 60);
  f_school   TEXT := left(btrim(COALESCE(p_form->>'school_name', '')), 160);
  f_email    TEXT := left(btrim(COALESCE(p_form->>'student_email', '')), 200);
  f_title    TEXT := left(btrim(COALESCE(p_form->>'project_title', '')), 300);
  f_cat      TEXT := left(btrim(COALESCE(p_form->>'category', '')), 80);
  f_advisor  TEXT := left(btrim(COALESCE(p_form->>'advisor_name', '')), 120);
BEGIN
  SELECT * INTO v_link FROM registration_links WHERE token = p_token;
  IF NOT FOUND OR NOT v_link.active OR (v_link.expires_at IS NOT NULL AND v_link.expires_at < NOW()) THEN
    RAISE EXCEPTION 'This registration link is not active. Ask the organizer for a new link.' USING ERRCODE = 'P0001';
  END IF;
  v_sid := v_link.school_id;

  IF f_name = '' OR f_grade = '' OR f_division = '' OR f_school = '' OR f_email = ''
     OR f_title = '' OR f_cat = ''
     OR COALESCE((p_form->>'is_original_work')::boolean, false) = false
     OR COALESCE((p_form->>'agrees_to_rules')::boolean, false) = false THEN
    RAISE EXCEPTION 'Please fill in all required fields and check both consent boxes.' USING ERRCODE = 'P0001';
  END IF;
  IF f_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Please enter a valid email address.' USING ERRCODE = 'P0001';
  END IF;

  -- Students: up to 6 names, each capped.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', n, 'grade', '')), '[]'::jsonb),
         COALESCE(string_agg(n, ', '), '')
    INTO v_members, v_names
  FROM (
    SELECT left(btrim(x), 120) AS n
    FROM jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(p_form->'group_members') = 'array' THEN p_form->'group_members' ELSE '[]'::jsonb END
         ) AS x
    WHERE btrim(x) <> ''
    LIMIT 6
  ) s;
  -- The registering student is always a member (first), unless they listed themselves.
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_members) e
                 WHERE lower(btrim(e->>'name')) = lower(f_name)) THEN
    v_members := jsonb_build_array(jsonb_build_object('name', f_name, 'grade', f_grade)) || v_members;
  END IF;

  -- Serialise numbering per school so concurrent submissions never collide.
  PERFORM pg_advisory_xact_lock(hashtext('submit_registration:' || v_sid::text));

  SELECT COUNT(*) INTO v_count FROM registration_submissions WHERE school_id = v_sid;
  v_prefix := COALESCE(p_form->>'reg_prefix', '');
  IF v_prefix !~ '^[A-Za-z]{2,5}-[A-Z]{2,4}$' THEN v_prefix := 'UNK-OTH'; END IF;
  v_reg := v_prefix || '-' || lpad((v_count + 1)::text, 3, '0');

  -- Project number continues after the highest existing number (admin-added or not).
  SELECT COALESCE(MAX(NULLIF(regexp_replace(num, '\D', '', 'g'), '')::int), 0) + 1
    INTO v_num FROM projects WHERE school_id = v_sid;
  v_pnum := lpad(v_num::text, 3, '0');
  v_pid  := 'p_reg_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);

  -- description column comes from migration-2026-10-project-details.sql (run first).
  INSERT INTO projects (id, school_id, num, title, cat, grade, locked, description)
  VALUES (v_pid, v_sid, v_pnum, f_title, f_cat, f_grade, false,
          left(btrim(COALESCE(p_form->>'description', '')), 2000));

  INSERT INTO project_private (project_id, school_id, advisor_name, group_members)
  VALUES (v_pid, v_sid, f_advisor, v_members);

  INSERT INTO registration_submissions (
    school_id, project_id, reg_number, student_name, grade_level, division, school_name,
    student_email, contact_number, project_title, category, project_type, group_members,
    advisor_name, advisor_email, school_department, description, research_question, hypothesis,
    needs_electricity, special_equipment, has_trifold, is_original_work, agrees_to_rules,
    guardian_name, guardian_signature
  ) VALUES (
    v_sid, v_pid, v_reg, f_name, f_grade, f_division, f_school,
    f_email, left(btrim(COALESCE(p_form->>'contact_number', '')), 40), f_title, f_cat,
    left(btrim(COALESCE(p_form->>'project_type', 'Individual')), 40), v_names,
    f_advisor, left(btrim(COALESCE(p_form->>'advisor_email', '')), 200),
    left(btrim(COALESCE(p_form->>'school_department', '')), 120),
    left(btrim(COALESCE(p_form->>'description', '')), 4000),
    left(btrim(COALESCE(p_form->>'research_question', '')), 2000),
    left(btrim(COALESCE(p_form->>'hypothesis', '')), 2000),
    COALESCE((p_form->>'needs_electricity')::boolean, false),
    left(btrim(COALESCE(p_form->>'special_equipment', '')), 1000),
    COALESCE((p_form->>'has_trifold')::boolean, true),
    true, true,
    left(btrim(COALESCE(p_form->>'guardian_name', '')), 120),
    left(btrim(COALESCE(p_form->>'guardian_signature', '')), 120)
  );

  RETURN jsonb_build_object('reg_number', v_reg, 'project_id', v_pid, 'project_num', v_pnum);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_registration(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_registration(TEXT, JSONB) TO anon, authenticated;

-- The RPC is now the only way in; close direct anonymous inserts (spam / bypassing the token).
DROP POLICY IF EXISTS "reg_sub_insert" ON public.registration_submissions;
CREATE POLICY "reg_sub_insert" ON public.registration_submissions FOR INSERT WITH CHECK (false);

-- ── Verify (run as anon, e.g. with curl and the anon key — see CLAUDE.md rule 28) ──
--   projects?select=group_members        → 400 "column ... does not exist"
--   project_private?select=project_id    → 401/permission denied (anon) — NOT 200
--   rpc/submit_registration {"p_token":"x","p_form":{}} → "registration link is not active"
