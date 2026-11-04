-- ═══════════════════════════════════════════════════════════════════════════
-- migration-2026-11b-invite-lockout-per-device.sql   (FIXES_2026-11.md F6, SQL part)
-- Run AFTER 2026-11a (it replaces register_judge_secure(), same signature).
--
-- WHY. The invite-code lockout counted wrong codes PER SCHOOL: 5 wrong codes — five typos by real
-- judges at the briefing, or anyone who knows the school's id — locked sign-in for EVERY judge for
-- 5 minutes, the correct code included. And the counter was never reset when a lock expired, so
-- after the first lockout every single wrong code locked the whole school again.
--
-- WHAT. register_judge_secure() checks the invite code itself, BEFORE register_judge():
--   • per DEVICE (the random id the app sends): 5 wrong codes lock that device for 5 minutes;
--   • per SCHOOL, as a ceiling against a real attack: 30 wrong codes lock everyone for 5 minutes;
--   • a lock that has expired starts a fresh count (it used to re-lock on the next mistake).
-- A right code never reaches register_judge()'s old school-wide counter, so that counter no longer
-- moves; any lock left on it from before is cleared on the next correct sign-in. Wrong codes are
-- still RETURNED, never raised (rule 66: a RAISE would roll back the counter).
-- The device id is chosen by the client, so it limits honest mistakes, not an attacker — the
-- 30-per-school ceiling is what stops guessing. Not coupled: the app already sends p_device.
-- Re-runnable.
-- ═══════════════════════════════════════════════════════════════════════════

-- Records one failure for (school, kind) and locks it for 5 minutes at p_limit failures.
-- A lock that has already expired starts a fresh count.
CREATE OR REPLACE FUNCTION public._note_auth_failure_n(p_school_id uuid, p_kind text, p_limit int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO security_attempts (school_id, kind, fails, locked_until)
  VALUES (p_school_id, p_kind, 1, CASE WHEN p_limit <= 1 THEN now() + interval '5 minutes' END)
  ON CONFLICT (school_id, kind) DO UPDATE SET
    fails = CASE WHEN security_attempts.locked_until IS NOT NULL AND security_attempts.locked_until <= now()
                 THEN 1 ELSE security_attempts.fails + 1 END,
    locked_until = CASE WHEN (CASE WHEN security_attempts.locked_until IS NOT NULL AND security_attempts.locked_until <= now()
                                   THEN 1 ELSE security_attempts.fails + 1 END) >= p_limit
                        THEN now() + interval '5 minutes' ELSE NULL END;
END $$;

CREATE OR REPLACE FUNCTION public.register_judge_secure(
  p_school_id uuid, p_department_id uuid, p_alias text, p_invite_code text, p_device text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v        jsonb;
  v_secret text;
  v_code   text;
  v_dev    text := 'invite_dev:' || left(COALESCE(NULLIF(btrim(p_device), ''), 'unknown'), 64);
BEGIN
  PERFORM assert_not_locked(p_school_id, v_dev);        -- this device made 5 mistakes
  PERFORM assert_not_locked(p_school_id, 'invite_all'); -- 30 mistakes school-wide: an attack
  SELECT invite_code INTO v_code FROM schools WHERE id = p_school_id;
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'School not found' USING ERRCODE = 'P0001';
  END IF;
  IF upper(btrim(COALESCE(p_invite_code, ''))) <> upper(v_code) THEN
    PERFORM _note_auth_failure_n(p_school_id, v_dev, 5);
    PERFORM _note_auth_failure_n(p_school_id, 'invite_all', 30);
    RETURN jsonb_build_object('error', 'Invalid invite code');   -- RETURNED (rule 66)
  END IF;
  -- The right code: clear this device's count and any lock left on the OLD school-wide key
  -- (register_judge() checks it first and would otherwise refuse the right code).
  DELETE FROM security_attempts WHERE school_id = p_school_id AND kind IN (v_dev, 'invite');

  v := register_judge(p_school_id, p_department_id, p_alias, p_invite_code);
  IF v ? 'error' THEN RETURN v; END IF;
  v_secret := encode(gen_random_bytes(24), 'hex');
  INSERT INTO judge_secrets (judge_id, school_id, secret_hash, issued_at)
  VALUES (v->>'id', p_school_id, encode(digest(v_secret, 'sha256'), 'hex'), now())
  ON CONFLICT (judge_id, school_id) DO UPDATE
    SET secret_hash = EXCLUDED.secret_hash, issued_at = now();
  RETURN v || jsonb_build_object('judge_secret', v_secret);
END $$;

REVOKE ALL ON FUNCTION public._note_auth_failure_n(uuid, text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_judge_secure(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_judge_secure(uuid, uuid, text, text, text) TO anon, authenticated;
