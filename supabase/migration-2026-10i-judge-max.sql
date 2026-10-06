-- ════════════════════════════════════════════════════════════════════════════
-- Migration 2026-10i — a school-wide maximum on judge numbers (default 15, up to 90)
-- ════════════════════════════════════════════════════════════════════════════
-- WHY
--   Judge numbers could run to 999, and the 2026-10g backfill sized every department
--   from its old max_judges (15 each → Judge 1–90 for six departments). A fair has ~15
--   judges, so the default should be 15, raisable by the admin up to 90.
--
-- WHAT
--   • app_settings 'judge_max' — highest judge number allowed. Default 15 when absent;
--     always clamped to 1–90 by judge_max().
--   • backfill: every school that already has judge numbers gets
--     judge_max = clamp(highest number in use, 15, 90) — nothing that works today breaks
--     (the live school, numbered 1–90, keeps 90 until the admin lowers it).
--   • set_judge_max()       — admin: change it; refuses to go below a number in use.
--   • set_judge_numbers()   — same as 2026-10h, plus: no range may go past judge_max.
--   • new departments are numbered only if they fit under judge_max (else no judges
--     until the admin assigns some — the Setup tab flags it).
--
-- ⚠️ SUPERSEDES set_judge_numbers() from 2026-10h and departments_assign_judge_range()
--   from 2026-10g. If you re-run either of those files, re-run THIS one straight after.
--
-- COUPLING: not coupled. New app without it: the app treats the maximum as
--   max(15, highest number in use), and "Save maximum" says this migration is missing.
--   Old app with it: unaffected (it never sends numbers above the maximum it showed).
--
-- RE-RUNNABLE.
-- ════════════════════════════════════════════════════════════════════════════


-- ── PART 1: the setting ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.judge_max(p_school_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT LEAST(90, GREATEST(1, COALESCE(
    (SELECT value::int FROM app_settings
      WHERE school_id = p_school_id AND key = 'judge_max' AND value ~ '^[0-9]{1,3}$'),
    15)))
$$;
GRANT EXECUTE ON FUNCTION public.judge_max(uuid) TO anon, authenticated;

-- Backfill: keep every existing school working at the size it already uses.
INSERT INTO app_settings (school_id, key, value)
SELECT school_id, 'judge_max', LEAST(90, GREATEST(15, max(judge_to)))::text
  FROM departments WHERE judge_to IS NOT NULL
 GROUP BY school_id
ON CONFLICT (school_id, key) DO NOTHING;


-- ── PART 2: set_judge_max() ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_judge_max(p_school_id uuid, p_max int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_top  int;
  v_name text;
BEGIN
  IF NOT is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'P0001';
  END IF;
  IF p_max IS NULL OR p_max < 1 OR p_max > 90 THEN
    RAISE EXCEPTION 'The maximum must be between 1 and 90.' USING ERRCODE = 'P0001';
  END IF;
  SELECT judge_to, name INTO v_top, v_name FROM departments
   WHERE school_id = p_school_id AND judge_to IS NOT NULL
   ORDER BY judge_to DESC LIMIT 1;
  IF v_top IS NOT NULL AND v_top > p_max THEN
    RAISE EXCEPTION 'Judge numbers already go up to % (%). Lower the department numbers first, then the maximum.',
      v_top, v_name USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO app_settings (school_id, key, value) VALUES (p_school_id, 'judge_max', p_max::text)
  ON CONFLICT (school_id, key) DO UPDATE SET value = EXCLUDED.value;
END $$;
GRANT EXECUTE ON FUNCTION public.set_judge_max(uuid, int) TO authenticated;


-- ── PART 3: new departments respect the maximum ─────────────────────────────
CREATE OR REPLACE FUNCTION public.departments_assign_judge_range()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_last int;
  v_size int := GREATEST(COALESCE(NEW.max_judges, 5), 1);
BEGIN
  IF NEW.judge_from IS NULL AND NEW.judge_to IS NULL THEN
    SELECT COALESCE(max(judge_to), 0) INTO v_last
      FROM departments WHERE school_id = NEW.school_id;
    -- Only if it fits under the school's maximum; otherwise the department starts with
    -- no judges and the Setup tab asks the admin to give it some.
    IF v_last + v_size <= judge_max(NEW.school_id) THEN
      NEW.judge_from := v_last + 1;
      NEW.judge_to   := v_last + v_size;
    END IF;
  END IF;
  RETURN NEW;
END $$;


-- ── PART 4: set_judge_numbers() — 2026-10h + the maximum ────────────────────
CREATE OR REPLACE FUNCTION public.set_judge_numbers(p_school_id uuid, p_ranges jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bad record;
  v_school_mode boolean;
  v_max int;
BEGIN
  IF NOT is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_ranges) <> 'array' THEN
    RAISE EXCEPTION 'Expected a list of departments.' USING ERRCODE = 'P0001';
  END IF;
  v_school_mode := judge_numbering_mode(p_school_id) = 'school';
  v_max := judge_max(p_school_id);

  CREATE TEMP TABLE IF NOT EXISTS _jn (id uuid PRIMARY KEY, name text, ord int, f int, t int) ON COMMIT DROP;
  DELETE FROM _jn;
  INSERT INTO _jn SELECT id, name, ord, judge_from, judge_to FROM departments WHERE school_id = p_school_id;

  FOR v_bad IN
    SELECT (e ->> 'department_id')::uuid AS id,
           NULLIF(e ->> 'from', '')::int AS f,
           NULLIF(e ->> 'to', '')::int   AS t
      FROM jsonb_array_elements(p_ranges) e
  LOOP
    IF NOT EXISTS (SELECT 1 FROM _jn WHERE id = v_bad.id) THEN
      RAISE EXCEPTION 'Unknown department.' USING ERRCODE = 'P0001';
    END IF;
    IF (v_bad.f IS NULL) <> (v_bad.t IS NULL)
       OR (v_bad.f IS NOT NULL AND (v_bad.f < 1 OR v_bad.t < v_bad.f OR v_bad.t > 999)) THEN
      RAISE EXCEPTION 'Judge numbers must run from 1 to 999, lowest first.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE _jn SET f = v_bad.f, t = v_bad.t WHERE id = v_bad.id;
  END LOOP;

  -- No number above the school's maximum (2026-10i).
  SELECT name, t INTO v_bad FROM _jn WHERE t > v_max ORDER BY t DESC LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '% would use judge numbers up to %, but the maximum is %. Raise the maximum (up to 90) first.',
      v_bad.name, v_bad.t, v_max USING ERRCODE = 'P0001';
  END IF;

  -- (Overlapping ranges are allowed since 2026-10h: that is how departments share judges.)

  IF v_school_mode THEN
    CREATE TEMP TABLE IF NOT EXISTS _jj (id text PRIMARY KEY, alias text, old_ids jsonb, new_ids jsonb, old_primary uuid) ON COMMIT DROP;
    DELETE FROM _jj;
    INSERT INTO _jj
    SELECT j.id, j.alias,
           CASE WHEN jsonb_array_length(COALESCE(j.department_ids, '[]'::jsonb)) > 0 THEN j.department_ids
                WHEN j.department_id IS NOT NULL THEN jsonb_build_array(j.department_id::text)
                ELSE '[]'::jsonb END,
           COALESCE((SELECT jsonb_agg(n.id::text ORDER BY n.ord, n.name) FROM _jn n
                      WHERE n.f IS NOT NULL AND substr(j.alias, 6)::int BETWEEN n.f AND n.t), '[]'::jsonb),
           j.department_id
      FROM judges j
     WHERE j.school_id = p_school_id AND j.alias ~ '^Judge[0-9]{1,3}$';

    -- A judge may GAIN departments, never silently LOSE one.
    SELECT jj.alias, n.name INTO v_bad
      FROM _jj jj
      CROSS JOIN LATERAL jsonb_array_elements_text(jj.old_ids) AS o(dept)
      JOIN _jn n ON n.id::text = o.dept
     WHERE NOT (jj.new_ids ? o.dept)
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION '% is signed in to % and would lose it. Remove that judge on the Judges tab first, or keep their number in %''s range.',
        v_bad.alias, v_bad.name, v_bad.name USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE departments d
     SET judge_from = n.f, judge_to = n.t,
         max_judges = CASE WHEN n.f IS NULL THEN d.max_judges ELSE n.t - n.f + 1 END
    FROM _jn n
   WHERE d.id = n.id AND d.school_id = p_school_id;

  IF v_school_mode THEN
    UPDATE judges j
       SET department_ids = jj.new_ids,
           department_id  = CASE WHEN jj.new_ids ? jj.old_primary::text THEN jj.old_primary
                                 ELSE (jj.new_ids ->> 0)::uuid END,
           projects = COALESCE((
             SELECT jsonb_agg(p.id ORDER BY d.ord, p.num)
               FROM projects p JOIN departments d ON d.id = p.department_id
              WHERE p.school_id = p_school_id
                AND jj.new_ids ? p.department_id::text), '[]'::jsonb)
      FROM _jj jj
     WHERE j.id = jj.id AND j.school_id = p_school_id
       AND jsonb_array_length(jj.new_ids) > 0;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.set_judge_numbers(uuid, jsonb) TO authenticated;
