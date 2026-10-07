-- ============================================================================
-- migration-2026-10m-ratelimit-regnum-project-moves.sql
-- Three correctness fixes found in the 2026-10-06 review. Additive and re-runnable;
-- it changes no table data. Run AFTER 2026-10k (it redefines register_judge) and
-- after 2026-10f / 2026-10j (the project-move guard reads scoring_mode and rubric_id).
--
-- 1. register_judge()      — the invite-code lockout never counted a single failure.
-- 2. submit_registration() — registration numbers were reused after a deletion.
-- 3. projects              — a scored project could be moved to a department that
--                            judges it differently (another rubric, or comments-only).
--
-- ⚠️ SUPERSEDES register_judge() (2026-10k) and submit_registration() (2026-10b).
--    Re-running either of those files restores the older body — re-run THIS file after.
--
-- COUPLED TO THE APP BUILD for part 1: register_judge() now reports a wrong invite code
-- as {"error": "Invalid invite code"} instead of raising. An older app build shows
-- "Registration failed. Please try again." instead of the exact message; it does not let
-- anyone in (the row is still only created on a correct code), so the order is not critical.
-- ============================================================================


-- ── PART 1: the invite-code lockout actually counts (finding #3) ────────────
CREATE OR REPLACE FUNCTION public.register_judge(
  p_school_id     uuid,
  p_department_id uuid,
  p_alias         text,
  p_invite_code   text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code     text;
  v_mode     text;
  v_dept     departments%ROWTYPE;
  v_dept_ids jsonb;
  v_existing judges%ROWTYPE;
  v_alias    text := btrim(COALESCE(p_alias, ''));
  v_num      int;
  v_count    int;
  v_projects jsonb;
  v_id       text;
  v_allow    jsonb;
  v_until    bigint;
  v_now_ms   bigint := (extract(epoch FROM now()) * 1000)::bigint;
BEGIN
  PERFORM assert_not_locked(p_school_id, 'invite');

  SELECT invite_code INTO v_code FROM schools WHERE id = p_school_id;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'School not found' USING ERRCODE = 'P0001';
  END IF;
  IF upper(btrim(COALESCE(p_invite_code, ''))) <> upper(v_code) THEN
    -- 2026-10m: RETURN, never RAISE, on a wrong code. A RAISE aborts the transaction and
    -- takes note_auth_failure()'s row down with it, so the counter never reached 1 and the
    -- documented "5 attempts = 5 minute lockout" did not exist. Returning commits it.
    -- The caller checks the 'error' key; a judges row never has one.
    PERFORM note_auth_failure(p_school_id, 'invite');
    RETURN jsonb_build_object('error', 'Invalid invite code');
  END IF;
  DELETE FROM security_attempts WHERE school_id = p_school_id AND kind = 'invite';

  v_mode := judge_numbering_mode(p_school_id);
  IF v_alias ~ '^Judge[0-9]{1,3}$' THEN
    v_num   := substr(v_alias, 6)::int;
    v_alias := 'Judge' || v_num;
  END IF;

  IF v_mode = 'school' THEN
    IF v_num IS NULL OR v_num < 1 THEN
      RAISE EXCEPTION 'Enter your judge number (1 - %).', judge_max(p_school_id) USING ERRCODE = 'P0001';
    END IF;
    v_dept_ids := _judge_dept_ids(p_school_id, v_num);
    IF jsonb_array_length(v_dept_ids) = 0 THEN
      RAISE EXCEPTION 'Judge % is not on this school''s judge list. Check your number with the coordinator.',
        v_num USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_dept FROM departments WHERE id = (v_dept_ids ->> 0)::uuid AND school_id = p_school_id;
    SELECT * INTO v_existing FROM judges
     WHERE school_id = p_school_id AND alias = v_alias ORDER BY joined_at LIMIT 1;
  ELSE
    SELECT * INTO v_dept FROM departments WHERE id = p_department_id AND school_id = p_school_id;
    IF v_dept.id IS NULL THEN
      RAISE EXCEPTION 'Please select your department.' USING ERRCODE = 'P0001';
    END IF;
    IF v_num IS NULL OR v_num < 1 OR v_num > v_dept.max_judges THEN
      RAISE EXCEPTION 'Invalid judge name. Use Judge1 - Judge% for %.',
        v_dept.max_judges, v_dept.name USING ERRCODE = 'P0001';
    END IF;
    v_dept_ids := jsonb_build_array(v_dept.id::text);
    SELECT * INTO v_existing FROM judges
     WHERE school_id = p_school_id AND department_id = p_department_id AND alias = v_alias;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    SELECT NULLIF(value, '')::jsonb INTO v_allow FROM app_settings
     WHERE school_id = p_school_id AND key = 'judge_transfer_allowances';
    v_allow := COALESCE(v_allow, '{}'::jsonb);
    v_until := GREATEST(
      COALESCE((v_allow ->> (v_existing.department_id::text || ':' || v_alias))::bigint, 0),
      COALESCE((v_allow ->> v_alias)::bigint, 0));
    IF v_until < v_now_ms THEN
      RAISE EXCEPTION '% is already signed in. Ask the admin to approve a device transfer.',
        v_alias USING ERRCODE = 'P0001';
    END IF;
    v_allow := (v_allow - (v_existing.department_id::text || ':' || v_alias)) - v_alias;
    UPDATE app_settings SET value = v_allow::text
     WHERE school_id = p_school_id AND key = 'judge_transfer_allowances';
    RETURN to_jsonb(v_existing);
  END IF;

  IF v_mode = 'department' THEN
    SELECT count(*) INTO v_count FROM judges WHERE school_id = p_school_id AND department_id = v_dept.id;
    IF v_count >= v_dept.max_judges THEN
      RAISE EXCEPTION '% is full (%/%). Contact admin.', v_dept.name, v_count, v_dept.max_judges
        USING ERRCODE = 'P0001';
    END IF;
    -- Legacy numbering: numbers restart per department, so panels (which are keyed on the
    -- school-wide number) do not apply — every judge scores every project, as before.
    SELECT COALESCE(jsonb_agg(id ORDER BY num), '[]'::jsonb) INTO v_projects
      FROM projects WHERE school_id = p_school_id AND department_id = v_dept.id;
  ELSE
    v_projects := _judge_projects(p_school_id, v_num, v_dept_ids);
  END IF;

  v_id := 'j_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
  INSERT INTO judges (id, school_id, alias, projects, department_id, department_ids)
  VALUES (v_id, p_school_id, v_alias, v_projects, v_dept.id, v_dept_ids);
  SELECT * INTO v_existing FROM judges WHERE id = v_id AND school_id = p_school_id;
  RETURN to_jsonb(v_existing);
END $$;


-- ── PART 2: registration numbers are never reused (finding #9) ─────────────
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

  -- 2026-10m: was COUNT(*), so deleting a submission handed its number to the next student
  -- (001, 002, delete 001, 002 again). Continue after the highest number ever issued.
  SELECT COALESCE(MAX(NULLIF(substring(reg_number FROM '[0-9]+$'), '')::int), 0)
    INTO v_count FROM registration_submissions WHERE school_id = v_sid;
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

-- Belt and braces. v1 had UNIQUE on reg_number and the v2 rewrite dropped it. Creating it
-- would FAIL on a database that already holds duplicates, which would abort the whole
-- migration — so check first and warn instead. Fix the duplicates, then re-run this file.
DO $do$
DECLARE v_dupes int;
BEGIN
  SELECT count(*) INTO v_dupes FROM (
    SELECT school_id, reg_number FROM public.registration_submissions
     WHERE reg_number IS NOT NULL
     GROUP BY 1, 2 HAVING count(*) > 1) d;
  IF v_dupes > 0 THEN
    RAISE WARNING 'registration_submissions already holds % duplicated reg_number(s) — unique index NOT created. Renumber them, then re-run this migration.', v_dupes;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS registration_submissions_school_regnum_uniq
      ON public.registration_submissions (school_id, reg_number);
  END IF;
END $do$;


-- ── PART 3: a scored project cannot move to a differently-judged department (finding #5) ──
-- Moving between two departments that use the SAME rubric and the same scoring mode stays
-- allowed: that is a legitimate "this project was filed in the wrong place" fix and the
-- scores remain valid. Only a move that would reinterpret or hide existing scores is
-- refused. Deleting the scores (or Reset All Data) unblocks the move.
CREATE OR REPLACE FUNCTION public.projects_guard_department_move()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_default    uuid;
  v_old_rubric uuid; v_new_rubric uuid;
  v_old_mode   text; v_new_mode   text;
  v_old_name   text; v_new_name   text;
BEGIN
  IF NEW.department_id IS NOT DISTINCT FROM OLD.department_id THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM scores s
                  WHERE s.school_id = NEW.school_id AND s.project_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_default FROM rubrics
   WHERE school_id = NEW.school_id AND is_active LIMIT 1;

  SELECT COALESCE(d.rubric_id, v_default), COALESCE(d.scoring_mode, 'scored'), d.name
    INTO v_old_rubric, v_old_mode, v_old_name
    FROM departments d WHERE d.id = OLD.department_id;
  IF NOT FOUND THEN
    v_old_rubric := v_default; v_old_mode := 'scored'; v_old_name := 'no department';
  END IF;

  SELECT COALESCE(d.rubric_id, v_default), COALESCE(d.scoring_mode, 'scored'), d.name
    INTO v_new_rubric, v_new_mode, v_new_name
    FROM departments d WHERE d.id = NEW.department_id;
  IF NOT FOUND THEN
    v_new_rubric := v_default; v_new_mode := 'scored'; v_new_name := 'no department';
  END IF;

  IF v_old_mode IS DISTINCT FROM v_new_mode THEN
    RAISE EXCEPTION 'Project #% has already been scored, and % is judged a different way than % (one is comments-only). Delete its scores first if you really need to move it.',
      NEW.num, v_new_name, v_old_name USING ERRCODE = 'P0001';
  END IF;
  IF v_old_rubric IS DISTINCT FROM v_new_rubric THEN
    RAISE EXCEPTION 'Project #% has already been scored with %''s rubric, and % uses a different one — its scores would be counted out of the wrong total. Delete its scores first if you really need to move it.',
      NEW.num, v_old_name, v_new_name USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS projects_guard_department_move ON public.projects;
CREATE TRIGGER projects_guard_department_move
  BEFORE UPDATE OF department_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.projects_guard_department_move();
