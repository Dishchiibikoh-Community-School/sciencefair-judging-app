-- ============================================================
-- Migration 2026-09 — RLS / security hardening (v2)
--
-- The v2 schema shipped with wide-open policies (`USING (true)`) on almost every
-- table. Because the Supabase anon key is embedded in the public JS bundle,
-- anyone could read and write those tables directly over the REST API.
--
-- Confirmed exposures before this migration:
--   * schools.admin_pin and schools.invite_code readable by anyone
--     (verified live: a plain curl returned {"admin_pin":"0000"})
--   * registration_submissions fully readable — student names, emails, phone
--     numbers, parent/guardian names, emails and signatures. PII of minors.
--   * registration_submissions UPDATE allowed for anyone
--   * app_settings INSERT/UPDATE allowed for anyone — so any visitor could set
--     results_finalized = true, unlock judging, or grant a transfer allowance
--   * activity_log and it_logs (the audit trail) readable by anyone
--
-- This migration closes those. It deliberately does NOT try to lock down
-- scores / judges / validations: judges are anonymous by design, so those
-- writes must stay open until a judge-identity model exists. See the
-- "Remaining / accepted risk" note in CLAUDE.md.
--
-- SAFE TO RE-RUN: every policy is dropped before being recreated.
-- Apply in: Supabase dashboard → SQL Editor → v2 project only
--           (ref evrupqnhgrfltfhafeyj / "sciencefair-v2").
--
-- REQUIRES the matching app build (commit that adds registration_count RPC
-- usage and post-auth log refetch). Apply the SQL and deploy together.
-- ============================================================


-- ── 1. schools.admin_pin must never reach an anonymous client ───────────────
-- RLS is row-level, so the row stays readable (the app needs id/name/slug/
-- invite_code to resolve a school) — we remove the column from anon's grant.
-- The `authenticated` role keeps it, which is how the admin UI reads the PIN.
REVOKE SELECT (admin_pin) ON public.schools FROM anon;

-- Belt and braces: make sure anon cannot write schools rows it doesn't own.
-- (INSERT stays open — that is how a new school self-registers.)
DROP POLICY IF EXISTS "schools_update" ON schools;
CREATE POLICY "schools_update" ON schools FOR UPDATE
  USING (is_school_admin(id));


-- ── 2. app_settings: reads stay open, writes become admin-only ──────────────
-- Anonymous judges legitimately need to READ `locked`, `deliberation_open`,
-- `results_finalized` and `judge_transfer_allowances`. Nothing anonymous has
-- any business WRITING here — every writer in the app is an admin action.
DROP POLICY IF EXISTS "app_settings_insert" ON app_settings;
DROP POLICY IF EXISTS "app_settings_update" ON app_settings;
CREATE POLICY "app_settings_insert" ON app_settings FOR INSERT
  WITH CHECK (is_school_admin(school_id));
CREATE POLICY "app_settings_update" ON app_settings FOR UPDATE
  USING (is_school_admin(school_id));


-- ── 3. registration_submissions: PII. Admin-read only. ─────────────────────
-- INSERT stays open so the student registration form keeps working, but nobody
-- may read or amend submissions except a school admin.
DROP POLICY IF EXISTS "reg_sub_select" ON registration_submissions;
DROP POLICY IF EXISTS "reg_sub_update" ON registration_submissions;
CREATE POLICY "reg_sub_select" ON registration_submissions FOR SELECT
  USING (is_school_admin(school_id));
CREATE POLICY "reg_sub_update" ON registration_submissions FOR UPDATE
  USING (is_school_admin(school_id));

-- The public registration form needs a submission COUNT to build the next
-- registration number, which it can no longer get via SELECT. Expose exactly
-- that one number — and nothing else — through a SECURITY DEFINER function.
CREATE OR REPLACE FUNCTION public.registration_count(p_school_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
  FROM registration_submissions
  WHERE school_id = p_school_id;
$$;

REVOKE ALL ON FUNCTION public.registration_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registration_count(uuid) TO anon, authenticated;


-- ── 4. Audit trails are admin-read only ────────────────────────────────────
-- Every client still WRITES to these (that is the point of an audit trail),
-- but only an admin may read them back.
DROP POLICY IF EXISTS "activity_log_select" ON activity_log;
CREATE POLICY "activity_log_select" ON activity_log FOR SELECT
  USING (is_school_admin(school_id));

DROP POLICY IF EXISTS "it_logs_select" ON it_logs;
CREATE POLICY "it_logs_select" ON it_logs FOR SELECT
  USING (is_school_admin(school_id));


-- ── Verify ─────────────────────────────────────────────────────────────────
-- As an ANONYMOUS caller these should now fail or return nothing:
--   curl "$URL/rest/v1/schools?select=admin_pin"            -> 42501 permission denied
--   curl "$URL/rest/v1/registration_submissions?select=*"   -> []
--   curl "$URL/rest/v1/it_logs?select=*"                    -> []
-- And these must still work:
--   curl "$URL/rest/v1/schools?select=id,name,slug,invite_code"  -> the school
--   curl "$URL/rest/v1/app_settings?select=key,value"            -> settings
