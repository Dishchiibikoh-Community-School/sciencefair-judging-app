-- ═══════════════════════════════════════════════════════════════════════════
-- migration-2026-11a-judge-write-integrity.sql   (FIXES_2026-11.md F1)
--
-- WHY. Judges have no Supabase Auth account. Until now the scores / validations /
-- deliberation_notes write policies (09b) only checked that the judge_id EXISTS in the
-- school — and judge ids are readable by anyone (judges_select USING true). With the public
-- anon key anyone could write or overwrite ANY judge's score on ANY project, plant a
-- concern that blocks Finalize, or forge deliberation notes — even after Finalize — with
-- no invite code and no trace. No score values were checked either (9999, -50, a project
-- of another school were all accepted).
--
-- WHAT.
--   1. judge_secrets — one random secret per judge, stored only as a SHA-256 hash, in a
--      table nobody can read (RLS on, no policies, all privileges revoked). The secret is
--      issued once, to the device that signs in, by register_judge_secure(). A device
--      transfer issues a new one and the old device's secret stops working.
--   2. register_judge_secure(school, dept, alias, invite, device) — wraps register_judge()
--      (unchanged) and returns the judge row + judge_secret. The plain register_judge() is
--      no longer callable by anon / authenticated, so every judge row has a secret.
--   3. submit_score / submit_validation / revise_validation / submit_delib_note — the ONLY
--      way judges write. Each checks the secret; submit_score also checks the project is
--      in this school AND on the judge's list, every criterion id and value against the
--      project's own rubric steps (all rated; `abstract` optional below grade 5), text
--      lengths, and refuses after results are finalized or once the judge has validated.
--      The judging LOCK is still not enforced here on purpose (rule 30: offline scores
--      made before the lock must still sync).
--   4. Direct INSERT/UPDATE on scores and deliberation_notes is closed; validations keep
--      only the admin's own row ('admin'), and only admins delete validations directly.
--   5. note_auth_failure / assert_not_locked revoked from anon/authenticated (Supabase
--      grants new functions to them by default; REVOKE FROM PUBLIC alone left them callable).
--
-- COUPLED WITH THE APP: deploy the app build that calls these functions FIRST (it falls back
-- to the old direct writes only when a function is missing), THEN run this file. An older
-- cached app keeps reading fine but can no longer save scores once this has run.
-- Judges who signed in BEFORE this ran have no secret: they must sign in again (Judges tab →
-- Allow Transfer). Simplest: run it before judges sign in (Reset All Data after the dry run
-- clears judges anyway).
-- Re-runnable. Re-run it after any re-run of 09b (09b re-creates the open policies).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Secrets ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.judge_secrets (
  judge_id    TEXT        NOT NULL,
  school_id   UUID        NOT NULL,
  secret_hash TEXT        NOT NULL,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (judge_id, school_id),
  FOREIGN KEY (judge_id, school_id) REFERENCES public.judges (id, school_id) ON DELETE CASCADE
);
ALTER TABLE public.judge_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.judge_secrets FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._judge_secret_ok(p_school_id uuid, p_judge_id text, p_secret text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT EXISTS (
    SELECT 1 FROM judge_secrets s
     WHERE s.school_id = p_school_id AND s.judge_id = p_judge_id
       AND s.secret_hash = encode(digest(COALESCE(p_secret, ''), 'sha256'), 'hex'));
$$;

-- ── 2. Sign-in that hands out the secret ───────────────────────────────────
-- p_device is accepted now so the per-device lockout (migration 2026-11b) can use it
-- without changing the signature PostgREST resolves.
CREATE OR REPLACE FUNCTION public.register_judge_secure(
  p_school_id uuid, p_department_id uuid, p_alias text, p_invite_code text, p_device text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v jsonb; v_secret text;
BEGIN
  v := register_judge(p_school_id, p_department_id, p_alias, p_invite_code);
  IF v ? 'error' THEN RETURN v; END IF;              -- wrong invite code: RETURNED (rule 66)
  v_secret := encode(gen_random_bytes(24), 'hex');
  INSERT INTO judge_secrets (judge_id, school_id, secret_hash, issued_at)
  VALUES (v->>'id', p_school_id, encode(digest(v_secret, 'sha256'), 'hex'), now())
  ON CONFLICT (judge_id, school_id) DO UPDATE
    SET secret_hash = EXCLUDED.secret_hash, issued_at = now();   -- a transfer revokes the old device
  RETURN v || jsonb_build_object('judge_secret', v_secret);
END $$;

-- ── 3a. Scores ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_score(
  p_school_id uuid, p_judge_id text, p_secret text, p_project_id text,
  p_criteria jsonb, p_notes text DEFAULT '', p_commendation text DEFAULT '',
  p_feedback jsonb DEFAULT '{}'::jsonb, p_safety_concern boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_judge  judges%ROWTYPE;
  v_proj   projects%ROWTYPE;
  v_dept   departments%ROWTYPE;
  v_rubric jsonb;
  v_crit   jsonb;
  v_key    text;
  v_val    jsonb;
  v_grade  int;
  v_crits  jsonb := COALESCE(p_criteria, '{}'::jsonb);
BEGIN
  IF NOT _judge_secret_ok(p_school_id, p_judge_id, p_secret) THEN
    RAISE EXCEPTION 'This device is not signed in as that judge. Sign in again (the organiser can press Allow Transfer).'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_judge FROM judges WHERE id = p_judge_id AND school_id = p_school_id;
  SELECT * INTO v_proj FROM projects WHERE id = p_project_id AND school_id = p_school_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That project is not in this school (it may have been removed).' USING ERRCODE = 'P0001';
  END IF;
  IF NOT (COALESCE(v_judge.projects, '[]'::jsonb) ? p_project_id) THEN
    RAISE EXCEPTION 'Project #% is not on your list.', v_proj.num USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM app_settings WHERE school_id = p_school_id AND key = 'results_finalized' AND value = 'true') THEN
    RAISE EXCEPTION 'Results are finalized, so scores can no longer change. Ask the organiser to reopen them.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM validations WHERE school_id = p_school_id AND judge_id = p_judge_id) THEN
    RAISE EXCEPTION 'You have already validated the results. Press Revise my validation first.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(v_crits) <> 'object' THEN
    RAISE EXCEPTION 'The ratings are not in the right shape.' USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(p_notes, '')) > 4000 OR length(COALESCE(p_commendation, '')) > 500
     OR length(COALESCE(p_feedback, '{}'::jsonb)::text) > 4000 THEN
    RAISE EXCEPTION 'A comment is too long.' USING ERRCODE = '22001';
  END IF;
  IF p_feedback IS NOT NULL AND jsonb_typeof(p_feedback) <> 'object' THEN
    RAISE EXCEPTION 'The comments are not in the right shape.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_dept FROM departments WHERE id = v_proj.department_id AND school_id = p_school_id;
  IF COALESCE(v_dept.scoring_mode, 'scored') = 'feedback' THEN
    IF v_crits <> '{}'::jsonb THEN
      RAISE EXCEPTION 'A comment-only project takes no ratings.' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT r.criteria INTO v_rubric FROM rubrics r
     WHERE r.school_id = p_school_id
       AND r.id = COALESCE(v_dept.rubric_id,
                           (SELECT id FROM rubrics WHERE school_id = p_school_id AND is_active ORDER BY created_at DESC LIMIT 1));
    IF jsonb_typeof(v_rubric) = 'array' AND jsonb_array_length(v_rubric) > 0 THEN
      v_grade := NULLIF(regexp_replace(COALESCE(v_proj.grade, ''), '\D', '', 'g'), '')::int;
      FOR v_key, v_val IN SELECT key, value FROM jsonb_each(v_crits) LOOP
        v_crit := (SELECT c FROM jsonb_array_elements(v_rubric) c WHERE c->>'id' = v_key LIMIT 1);
        IF v_crit IS NULL THEN
          RAISE EXCEPTION 'Rating "%" is not on this project''s form.', v_key USING ERRCODE = '22023';
        END IF;
        IF jsonb_typeof(v_val) <> 'number' OR NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(COALESCE(v_crit->'steps', '[]'::jsonb)) s
              WHERE jsonb_typeof(s) = 'number' AND (s #>> '{}')::numeric = (v_val #>> '{}')::numeric) THEN
          RAISE EXCEPTION 'Rating "%" has a value that is not on the form.', COALESCE(v_crit->>'label', v_key) USING ERRCODE = '22023';
        END IF;
      END LOOP;
      -- Every criterion rated. Grades below 5 skip `abstract` (requiresAbstract in the app).
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_rubric) c
                  WHERE NOT (v_crits ? (c->>'id'))
                    AND NOT (c->>'id' = 'abstract' AND COALESCE(v_grade, 0) < 5)) THEN
        RAISE EXCEPTION 'Every rating on the form must be filled in.' USING ERRCODE = '22023';
      END IF;
    ELSE
      -- No usable rubric row: the app shows its built-in form. Numbers 0–100 only.
      IF EXISTS (SELECT 1 FROM jsonb_each(v_crits) e
                  WHERE jsonb_typeof(e.value) <> 'number' OR (e.value #>> '{}')::numeric NOT BETWEEN 0 AND 100) THEN
        RAISE EXCEPTION 'A rating is out of range.' USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  INSERT INTO scores (school_id, judge_id, project_id, criteria, notes, commendation, feedback, safety_concern, submitted_at)
  VALUES (p_school_id, p_judge_id, p_project_id, v_crits, COALESCE(p_notes, ''), COALESCE(p_commendation, ''),
          COALESCE(p_feedback, '{}'::jsonb), COALESCE(p_safety_concern, false), now())
  ON CONFLICT (judge_id, project_id) DO UPDATE
    SET criteria = EXCLUDED.criteria, notes = EXCLUDED.notes, commendation = EXCLUDED.commendation,
        feedback = EXCLUDED.feedback, safety_concern = EXCLUDED.safety_concern, submitted_at = now()
    WHERE scores.school_id = p_school_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── 3b. Validations ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_validation(
  p_school_id uuid, p_judge_id text, p_secret text, p_approved boolean, p_comment text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT _judge_secret_ok(p_school_id, p_judge_id, p_secret) THEN
    RAISE EXCEPTION 'This device is not signed in as that judge.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM app_settings WHERE school_id = p_school_id AND key = 'results_finalized' AND value = 'true') THEN
    RAISE EXCEPTION 'Results are finalized.' USING ERRCODE = 'P0001';
  END IF;
  IF length(COALESCE(p_comment, '')) > 2000 THEN
    RAISE EXCEPTION 'The comment is too long.' USING ERRCODE = '22001';
  END IF;
  INSERT INTO validations (school_id, judge_id, approved, comment, validated_at)
  VALUES (p_school_id, p_judge_id, COALESCE(p_approved, false), COALESCE(p_comment, ''), now())
  ON CONFLICT (school_id, judge_id) DO UPDATE
    SET approved = EXCLUDED.approved, comment = EXCLUDED.comment, validated_at = now();
  RETURN jsonb_build_object('ok', true);
END $$;

-- A judge reopens THEIR OWN validation (never the admin's), until results are finalized (10d).
CREATE OR REPLACE FUNCTION public.revise_validation(p_school_id uuid, p_judge_id text, p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_n int;
BEGIN
  IF NOT _judge_secret_ok(p_school_id, p_judge_id, p_secret) THEN
    RAISE EXCEPTION 'This device is not signed in as that judge.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM app_settings WHERE school_id = p_school_id AND key = 'results_finalized' AND value = 'true') THEN
    RAISE EXCEPTION 'Results are already finalized, so your validation can no longer be changed.' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM validations WHERE school_id = p_school_id AND judge_id = p_judge_id AND judge_id <> 'admin';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_n);
END $$;

-- ── 3c. Deliberation notes — only while deliberation is open (rule 19, now server-side) ─
CREATE OR REPLACE FUNCTION public.submit_delib_note(
  p_school_id uuid, p_judge_id text, p_secret text, p_project_id text,
  p_comment text DEFAULT '', p_recommendation text DEFAULT 'Pending', p_flagged boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT _judge_secret_ok(p_school_id, p_judge_id, p_secret) THEN
    RAISE EXCEPTION 'This device is not signed in as that judge.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM app_settings WHERE school_id = p_school_id AND key = 'deliberation_open' AND value = 'true') THEN
    RAISE EXCEPTION 'Deliberation is not open.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = p_project_id AND school_id = p_school_id) THEN
    RAISE EXCEPTION 'That project is not in this school.' USING ERRCODE = 'P0001';
  END IF;
  IF length(COALESCE(p_comment, '')) > 2000 THEN
    RAISE EXCEPTION 'The comment is too long.' USING ERRCODE = '22001';
  END IF;
  INSERT INTO deliberation_notes (school_id, judge_id, project_id, comment, recommendation, flagged, submitted_at)
  VALUES (p_school_id, p_judge_id, p_project_id, COALESCE(p_comment, ''), COALESCE(p_recommendation, 'Pending'),
          COALESCE(p_flagged, false), now())
  ON CONFLICT (judge_id, project_id) DO UPDATE
    SET comment = EXCLUDED.comment, recommendation = EXCLUDED.recommendation, flagged = EXCLUDED.flagged, submitted_at = now()
    WHERE deliberation_notes.school_id = p_school_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── 4. Close the direct writes ─────────────────────────────────────────────
DROP POLICY IF EXISTS "scores_insert" ON public.scores;
DROP POLICY IF EXISTS "scores_update" ON public.scores;
CREATE POLICY "scores_insert" ON public.scores FOR INSERT WITH CHECK (false);
CREATE POLICY "scores_update" ON public.scores FOR UPDATE USING (false);

DROP POLICY IF EXISTS "delib_notes_insert" ON public.deliberation_notes;
DROP POLICY IF EXISTS "delib_notes_update" ON public.deliberation_notes;
CREATE POLICY "delib_notes_insert" ON public.deliberation_notes FOR INSERT WITH CHECK (false);
CREATE POLICY "delib_notes_update" ON public.deliberation_notes FOR UPDATE USING (false);

DROP POLICY IF EXISTS "validations_insert" ON public.validations;
DROP POLICY IF EXISTS "validations_update" ON public.validations;
DROP POLICY IF EXISTS "validations_delete" ON public.validations;
CREATE POLICY "validations_insert" ON public.validations FOR INSERT
  WITH CHECK (validations.judge_id = 'admin' AND is_school_admin(validations.school_id));
CREATE POLICY "validations_update" ON public.validations FOR UPDATE
  USING (validations.judge_id = 'admin' AND is_school_admin(validations.school_id));
CREATE POLICY "validations_delete" ON public.validations FOR DELETE
  USING (is_school_admin(validations.school_id));

-- ── 5. Grants ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._judge_secret_ok(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_judge(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.note_auth_failure(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_not_locked(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_judge_secure(uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_score(uuid, text, text, text, jsonb, text, text, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_validation(uuid, text, text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revise_validation(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_delib_note(uuid, text, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_judge_secure(uuid, uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_score(uuid, text, text, text, jsonb, text, text, jsonb, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_validation(uuid, text, text, boolean, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revise_validation(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_delib_note(uuid, text, text, text, text, text, boolean) TO anon, authenticated;

-- ── Verify (after running, with the anon key) ──────────────────────────────
--   curl -X POST "$URL/rest/v1/scores" -d '{...}'                → row-level security violation
--   curl -X POST "$URL/rest/v1/rpc/register_judge" -d '{...}'    → permission denied
--   curl -X POST "$URL/rest/v1/rpc/note_auth_failure" -d '{...}' → permission denied
--   curl -X POST "$URL/rest/v1/rpc/submit_score" -d '{... wrong secret ...}' → "not signed in as that judge"
