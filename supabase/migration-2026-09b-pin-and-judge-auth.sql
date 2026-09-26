-- ============================================================
-- Migration 2026-09b — hashed admin PIN + server-side judge registration (v2)
--
-- PART 0 fixes a mistake in migration-2026-09-security-hardening.sql:
--   REVOKE SELECT (admin_pin) ... FROM anon  did NOTHING, because Supabase
--   grants anon a TABLE-level SELECT on every table in `public`. In Postgres,
--   table-level and column-level privileges are additive: while the table grant
--   exists, revoking one column is a no-op. Verified live after that migration
--   "succeeded" — `?select=admin_pin` still returned {"admin_pin":"0000"}.
--   The fix is to revoke the table grant and re-grant only the safe columns.
--
-- PART 1 stops storing the admin PIN in plaintext. It is hashed with bcrypt by
--   a BEFORE trigger, so it is hashed no matter who writes it (including the
--   anonymous school-signup insert), and it is verified server-side through
--   verify_school_pin() with lockout after repeated failures. Nothing can read
--   the PIN back any more — not anon, not authenticated, not the admin UI.
--
--   NOTE: a hash, not reversible encryption. The app only ever needs to ANSWER
--   "is this the right PIN", never "what is the PIN". If the database leaks, an
--   encrypted PIN can be decrypted; a bcrypt hash cannot be.
--
-- PART 2 closes the judge-registration hole. Previously anyone who knew a
--   school slug could POST straight to /rest/v1/judges and invent judges, and
--   the invite code was handed to the browser to be compared in JavaScript.
--   Registration now goes through register_judge(), which checks the invite
--   code server-side (rate-limited), enforces the department cap, the alias
--   range and the admin transfer allowance, and is the ONLY way to create a
--   judge row. The invite code is never sent to an anonymous client again.
--
-- SAFE TO RE-RUN.
-- Apply in: Supabase dashboard → SQL Editor → v2 project only
--           (ref evrupqnhgrfltfhafeyj / "sciencefair-v2").
-- Ship together with the matching app build.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


-- ════════════════════════════════════════════════════════════
-- PART 0 — actually restrict the sensitive columns on `schools`
-- ════════════════════════════════════════════════════════════
-- Column privileges only bite once the table-level grant is gone.
REVOKE SELECT ON public.schools FROM anon;
REVOKE SELECT ON public.schools FROM authenticated;

-- Anonymous visitors resolve a school from its slug. That is all they get:
-- no invite_code (now verified server-side), no admin_pin (now a hash).
GRANT SELECT (id, name, slug, created_at) ON public.schools TO anon;

-- Signed-in users get the same columns. The invite code is deliberately NOT
-- here: an authenticated user of school A must not read school B's code.
-- Admins fetch their own code via school_invite_code() below.
GRANT SELECT (id, name, slug, created_at) ON public.schools TO authenticated;

-- Self-registration still needs to insert a school.
GRANT INSERT (name, slug, invite_code, admin_pin) ON public.schools TO anon, authenticated;


-- ════════════════════════════════════════════════════════════
-- PART 1 — admin PIN: hashed at rest, verified server-side
-- ════════════════════════════════════════════════════════════

-- Shared lockout tracker for PIN / invite-code brute force.
-- No RLS policies are created, so ONLY security-definer functions can touch it.
CREATE TABLE IF NOT EXISTS public.security_attempts (
  school_id    UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  kind         TEXT        NOT NULL,             -- 'pin' | 'invite'
  fails        INT         NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  PRIMARY KEY (school_id, kind)
);
ALTER TABLE public.security_attempts ENABLE ROW LEVEL SECURITY;

-- Records a failure and locks the school out after 5 tries. Returns nothing.
CREATE OR REPLACE FUNCTION public.note_auth_failure(p_school_id uuid, p_kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO security_attempts (school_id, kind, fails)
  VALUES (p_school_id, p_kind, 1)
  ON CONFLICT (school_id, kind) DO UPDATE SET
    fails = security_attempts.fails + 1,
    locked_until = CASE WHEN security_attempts.fails + 1 >= 5
                        THEN now() + interval '5 minutes' ELSE NULL END;
END $$;

-- Raises if the school is currently locked out for this kind of check.
CREATE OR REPLACE FUNCTION public.assert_not_locked(p_school_id uuid, p_kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_until timestamptz;
BEGIN
  SELECT locked_until INTO v_until
  FROM security_attempts WHERE school_id = p_school_id AND kind = p_kind;
  IF v_until IS NOT NULL AND v_until > now() THEN
    RAISE EXCEPTION 'Too many attempts. Try again in % seconds.',
      ceil(extract(epoch FROM (v_until - now())))::int
      USING ERRCODE = 'P0001';
  END IF;
END $$;

-- Hash on the way in, always. Covers the anonymous signup insert, admin PIN
-- changes, and anything else that ever writes the column.
CREATE OR REPLACE FUNCTION public.hash_admin_pin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
BEGIN
  IF NEW.admin_pin IS NULL OR btrim(NEW.admin_pin) = '' THEN
    NEW.admin_pin := crypt('0000', gen_salt('bf'));
  ELSIF NEW.admin_pin !~ '^\$2[aby]\$' THEN      -- not already a bcrypt hash
    NEW.admin_pin := crypt(NEW.admin_pin, gen_salt('bf'));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS schools_hash_pin ON public.schools;
CREATE TRIGGER schools_hash_pin
  BEFORE INSERT OR UPDATE OF admin_pin ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.hash_admin_pin();

-- Hash any PIN still stored in plaintext (the trigger does the work).
UPDATE public.schools SET admin_pin = admin_pin WHERE admin_pin !~ '^\$2[aby]\$';

-- Verify a PIN. Rate-limited; returns true/false, never the PIN.
CREATE OR REPLACE FUNCTION public.verify_school_pin(p_school_id uuid, p_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE v_hash text; v_ok boolean;
BEGIN
  PERFORM assert_not_locked(p_school_id, 'pin');
  SELECT admin_pin INTO v_hash FROM schools WHERE id = p_school_id;
  IF v_hash IS NULL THEN RETURN false; END IF;

  v_ok := (v_hash = crypt(COALESCE(p_pin, ''), v_hash));

  IF v_ok THEN
    DELETE FROM security_attempts WHERE school_id = p_school_id AND kind = 'pin';
  ELSE
    PERFORM note_auth_failure(p_school_id, 'pin');
  END IF;
  RETURN v_ok;
END $$;

-- Change the PIN. Admin only; minimum 4 characters.
CREATE OR REPLACE FUNCTION public.set_school_pin(p_school_id uuid, p_new_pin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'P0001';
  END IF;
  IF p_new_pin IS NULL OR length(btrim(p_new_pin)) < 4 THEN
    RAISE EXCEPTION 'PIN must be at least 4 characters' USING ERRCODE = 'P0001';
  END IF;
  UPDATE schools SET admin_pin = btrim(p_new_pin) WHERE id = p_school_id;  -- trigger hashes
  DELETE FROM security_attempts WHERE school_id = p_school_id AND kind = 'pin';
END $$;

-- Let an admin read back their own invite code (to hand to judges).
CREATE OR REPLACE FUNCTION public.school_invite_code(p_school_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  IF NOT is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'P0001';
  END IF;
  SELECT invite_code INTO v_code FROM schools WHERE id = p_school_id;
  RETURN v_code;
END $$;

-- Let an admin change the invite code.
CREATE OR REPLACE FUNCTION public.set_school_invite_code(p_school_id uuid, p_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'P0001';
  END IF;
  IF p_code IS NULL OR length(btrim(p_code)) < 4 THEN
    RAISE EXCEPTION 'Invite code must be at least 4 characters' USING ERRCODE = 'P0001';
  END IF;
  UPDATE schools SET invite_code = upper(btrim(p_code)) WHERE id = p_school_id;
  DELETE FROM security_attempts WHERE school_id = p_school_id AND kind = 'invite';
END $$;


-- ════════════════════════════════════════════════════════════
-- PART 2 — judge registration moves server-side
-- ════════════════════════════════════════════════════════════

-- Everything handleRegister() used to do in the browser, done where the client
-- cannot lie about it. Returns the judge row as jsonb.
CREATE OR REPLACE FUNCTION public.register_judge(
  p_school_id     uuid,
  p_department_id uuid,
  p_alias         text,
  p_invite_code   text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code     text;
  v_dept     departments%ROWTYPE;
  v_existing judges%ROWTYPE;
  v_alias    text := btrim(p_alias);
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
    PERFORM note_auth_failure(p_school_id, 'invite');
    RAISE EXCEPTION 'Invalid invite code' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM security_attempts WHERE school_id = p_school_id AND kind = 'invite';

  SELECT * INTO v_dept FROM departments
   WHERE id = p_department_id AND school_id = p_school_id;
  IF v_dept.id IS NULL THEN
    RAISE EXCEPTION 'Please select your department.' USING ERRCODE = 'P0001';
  END IF;

  v_num := NULLIF(regexp_replace(v_alias, '\D', '', 'g'), '')::int;
  IF v_alias !~ '^Judge[0-9]+$' OR v_num IS NULL
     OR v_num < 1 OR v_num > v_dept.max_judges THEN
    RAISE EXCEPTION 'Invalid judge name. Use Judge1 - Judge% for %.',
      v_dept.max_judges, v_dept.name USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_existing FROM judges
   WHERE school_id = p_school_id AND department_id = p_department_id AND alias = v_alias;

  IF v_existing.id IS NOT NULL THEN
    -- Already signed in somewhere: only proceed if the admin pre-approved a
    -- device transfer and the approval has not expired.
    SELECT NULLIF(value, '')::jsonb INTO v_allow FROM app_settings
     WHERE school_id = p_school_id AND key = 'judge_transfer_allowances';
    v_allow := COALESCE(v_allow, '{}'::jsonb);
    v_until := GREATEST(
      COALESCE((v_allow ->> (p_department_id::text || ':' || v_alias))::bigint, 0),
      COALESCE((v_allow ->> v_alias)::bigint, 0)
    );
    IF v_until < v_now_ms THEN
      RAISE EXCEPTION '% is already signed in for %. Ask admin to approve device transfer.',
        v_alias, v_dept.name USING ERRCODE = 'P0001';
    END IF;
    -- Consume the one-time approval.
    v_allow := (v_allow - (p_department_id::text || ':' || v_alias)) - v_alias;
    UPDATE app_settings SET value = v_allow::text
     WHERE school_id = p_school_id AND key = 'judge_transfer_allowances';
    RETURN to_jsonb(v_existing);
  END IF;

  SELECT count(*) INTO v_count FROM judges
   WHERE school_id = p_school_id AND department_id = p_department_id;
  IF v_count >= v_dept.max_judges THEN
    RAISE EXCEPTION '% is full (%/%). Contact admin.',
      v_dept.name, v_count, v_dept.max_judges USING ERRCODE = 'P0001';
  END IF;

  -- Every judge scores every project in their department.
  SELECT COALESCE(jsonb_agg(id ORDER BY num), '[]'::jsonb) INTO v_projects
    FROM projects WHERE school_id = p_school_id AND department_id = p_department_id;

  v_id := 'j_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);

  INSERT INTO judges (id, school_id, alias, projects, department_id)
  VALUES (v_id, p_school_id, v_alias, v_projects, p_department_id);

  SELECT * INTO v_existing FROM judges WHERE id = v_id AND school_id = p_school_id;
  RETURN to_jsonb(v_existing);
END $$;

-- register_judge is now the ONLY way to create a judge.
DROP POLICY IF EXISTS "judges_insert" ON judges;
CREATE POLICY "judges_insert" ON judges FOR INSERT WITH CHECK (false);

-- Judge rows are only rewritten by the admin (assignment re-sync).
DROP POLICY IF EXISTS "judges_update" ON judges;
CREATE POLICY "judges_update" ON judges FOR UPDATE USING (is_school_admin(school_id));

-- A score may only be written for a judge that actually exists in this school.
-- NOTE: we deliberately do NOT enforce `locked` here — a judge who scored
-- legitimately while offline must still be able to sync after the admin locks
-- judging, or their work would be silently destroyed. The lock is enforced in
-- submitScore() at the moment of scoring.
DROP POLICY IF EXISTS "scores_insert" ON scores;
DROP POLICY IF EXISTS "scores_update" ON scores;
CREATE POLICY "scores_insert" ON scores FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM judges j WHERE j.id = scores.judge_id AND j.school_id = scores.school_id)
);
CREATE POLICY "scores_update" ON scores FOR UPDATE USING (
  EXISTS (SELECT 1 FROM judges j WHERE j.id = scores.judge_id AND j.school_id = scores.school_id)
);

-- Same for the other judge-authored tables.
DROP POLICY IF EXISTS "delib_notes_insert" ON deliberation_notes;
DROP POLICY IF EXISTS "delib_notes_update" ON deliberation_notes;
CREATE POLICY "delib_notes_insert" ON deliberation_notes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM judges j WHERE j.id = deliberation_notes.judge_id AND j.school_id = deliberation_notes.school_id)
);
CREATE POLICY "delib_notes_update" ON deliberation_notes FOR UPDATE USING (
  EXISTS (SELECT 1 FROM judges j WHERE j.id = deliberation_notes.judge_id AND j.school_id = deliberation_notes.school_id)
);

DROP POLICY IF EXISTS "validations_insert" ON validations;
DROP POLICY IF EXISTS "validations_update" ON validations;
CREATE POLICY "validations_insert" ON validations FOR INSERT WITH CHECK (
  (validations.judge_id = 'admin' AND is_school_admin(validations.school_id))
  OR EXISTS (SELECT 1 FROM judges j WHERE j.id = validations.judge_id AND j.school_id = validations.school_id)
);
CREATE POLICY "validations_update" ON validations FOR UPDATE USING (
  (validations.judge_id = 'admin' AND is_school_admin(validations.school_id))
  OR EXISTS (SELECT 1 FROM judges j WHERE j.id = validations.judge_id AND j.school_id = validations.school_id)
);


-- ── Grants ─────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.note_auth_failure(uuid, text)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_not_locked(uuid, text)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hash_admin_pin()                     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_school_pin(uuid, text)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_school_pin(uuid, text)           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.school_invite_code(uuid)             FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_school_invite_code(uuid, text)   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_judge(uuid, uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.verify_school_pin(uuid, text)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_judge(uuid, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_school_pin(uuid, text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.school_invite_code(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_school_invite_code(uuid, text)   TO authenticated;


-- ── Verify ─────────────────────────────────────────────────────────────────
-- Anonymous (should all be denied / empty):
--   curl "$URL/rest/v1/schools?select=admin_pin"     -> 42501 permission denied
--   curl "$URL/rest/v1/schools?select=invite_code"   -> 42501 permission denied
--   curl -X POST "$URL/rest/v1/judges" -d '{...}'    -> row-level security violation
-- Anonymous (should still work):
--   curl "$URL/rest/v1/schools?select=id,name,slug"  -> the school
--   POST "$URL/rest/v1/rpc/verify_school_pin"  {"p_school_id":"...","p_pin":"0000"} -> true/false
--   POST "$URL/rest/v1/rpc/register_judge"     {...} -> judge row, or a clear error
