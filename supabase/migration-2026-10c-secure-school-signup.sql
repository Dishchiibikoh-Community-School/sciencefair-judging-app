-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 2026-10c — close the "make yourself admin of any school" hole
--
-- Run AFTER 2026-10b.  ⚠️ COUPLED to the app build: the school sign-up form now calls
-- create_school(). Run this, then deploy the matching app. (Old app + new SQL: new school
-- sign-ups fail with a permission error until the deploy lands. Nothing else is affected.)
-- Re-runnable.
--
-- THE HOLE (verified live 2026-10-05, without writing data):
--   schema-v2.sql created  school_admins_insert  WITH CHECK (true)  and no migration ever
--   tightened it. Anyone could create a free Supabase account, then
--     POST /rest/v1/school_admins {"school_id": <any school>, "user_id": <their own id>}
--   and become an admin of ANY school: read student names and registration PII, export
--   scores, change settings, unlock judging, finalize results. schools_insert was also
--   WITH CHECK (true), so anyone could create unlimited junk schools.
--
-- THE FIX:
--   create_school() is the only way to create a school, and it creates the school and its
--   FIRST admin link in one transaction. A user can therefore only ever become admin of a
--   school they are creating right now — never of an existing one.
--   Direct INSERT on schools and school_admins is closed to everyone.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_school(
  p_user_id     UUID,
  p_name        TEXT,
  p_slug        TEXT,
  p_invite_code TEXT,
  p_admin_pin   TEXT,
  p_rubric      JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_sid  UUID;
  v_name TEXT := btrim(COALESCE(p_name, ''));
  v_slug TEXT := lower(btrim(COALESCE(p_slug, '')));
  v_code TEXT := btrim(COALESCE(p_invite_code, ''));
  v_pin  TEXT := COALESCE(p_admin_pin, '');
BEGIN
  -- Who may link p_user_id as owner:
  --   * signed in  → only themselves;
  --   * not signed in (email confirmation pending, signUp returned no session) → only an
  --     account created in the last 24 hours that does not already run a school.
  -- Neither path can attach anyone to an EXISTING school: the school is created below.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'You can only create a school for your own account.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u
                 WHERE u.id = p_user_id AND u.created_at > NOW() - INTERVAL '24 hours') THEN
    RAISE EXCEPTION 'Account not found or too old to set up a new school here. Contact support.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM school_admins WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'This account already manages a school. Use a different email for a new school.' USING ERRCODE = 'P0001';
  END IF;

  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'School name must be 2–120 characters.' USING ERRCODE = 'P0001';
  END IF;
  IF v_slug !~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$' THEN
    RAISE EXCEPTION 'School URL may use lowercase letters, numbers and dashes (3–50 characters).' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM schools WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'That school URL is already taken. Choose another.' USING ERRCODE = 'P0001';
  END IF;
  IF length(v_code) < 4 OR length(v_code) > 40 THEN
    RAISE EXCEPTION 'Invalid invite code.' USING ERRCODE = 'P0001';
  END IF;
  IF v_pin !~ '^[0-9]{4,8}$' OR v_pin ~ '^(.)\1+$' OR v_pin IN ('1234', '12345', '123456', '1234567', '12345678') THEN
    RAISE EXCEPTION 'Admin PIN must be 4–8 digits and not easy to guess (0000, 1111, 1234…).' USING ERRCODE = 'P0001';
  END IF;

  -- admin_pin is bcrypt-hashed by the hash_admin_pin trigger (migration 2026-09b).
  INSERT INTO schools (name, slug, invite_code, admin_pin)
  VALUES (v_name, v_slug, v_code, v_pin)
  RETURNING id INTO v_sid;

  INSERT INTO school_admins (school_id, user_id, role) VALUES (v_sid, p_user_id, 'owner');

  INSERT INTO app_settings (school_id, key, value) VALUES
    (v_sid, 'locked', 'false'), (v_sid, 'deliberation_open', 'false'), (v_sid, 'results_finalized', 'false')
  ON CONFLICT DO NOTHING;

  INSERT INTO departments (school_id, name, max_judges, ord) VALUES
    (v_sid, 'Elementary', 5, 0), (v_sid, 'Middle School', 5, 1), (v_sid, 'High School', 5, 2);

  -- The default rubric lives in the app (DEFAULT_RUBRIC); it is passed in. If it is
  -- missing, ensureSeedData() creates it on the admin's first sign-in.
  IF jsonb_typeof(p_rubric) = 'array' AND jsonb_array_length(p_rubric) BETWEEN 1 AND 50 THEN
    INSERT INTO rubrics (school_id, name, criteria, is_active)
    VALUES (v_sid, 'Default (Northeast AZ Regional)', p_rubric, true);
  END IF;

  RETURN jsonb_build_object('id', v_sid, 'name', v_name, 'slug', v_slug);
END;
$$;

REVOKE ALL ON FUNCTION public.create_school(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_school(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- Close the direct paths.
DROP POLICY IF EXISTS "school_admins_insert" ON public.school_admins;
CREATE POLICY "school_admins_insert" ON public.school_admins FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "schools_insert" ON public.schools;
CREATE POLICY "schools_insert" ON public.schools FOR INSERT WITH CHECK (false);
-- 2026-09b granted anon/authenticated INSERT on these columns for the old client-side sign-up.
REVOKE INSERT ON public.schools FROM anon, authenticated;

-- ── Verify (as anon, with curl + the anon key) ──
--   POST /rest/v1/school_admins {"school_id":"<real school id>","user_id":"<any>"}
--        → 401/403 permission denied or RLS violation — must NOT be 201 or a 409 FK error
--   POST /rest/v1/schools {"name":"x","slug":"x"}  → permission denied
