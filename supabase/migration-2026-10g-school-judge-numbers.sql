-- ════════════════════════════════════════════════════════════════════════════
-- Migration 2026-10g — one judge list for the whole school (judge numbers)
-- ════════════════════════════════════════════════════════════════════════════
-- WHY
--   Judge numbers restarted in every department: PreK, K-2, 3-5 … each had its own
--   Judge1–Judge15. With six departments that is 90 open seats for ~15 real judges,
--   "Judge1" named six different people, and a judge who tapped the wrong department
--   could only be fixed with Reset All Data. (Found 2026-10-06: two "Judge1" rows,
--   PreK and K-2, on the live school.)
--
--   Now each department owns a RANGE of judge numbers (PreK = Judge1–2, K-2 =
--   Judge3–4, …). A number exists once per school, and the judge's department is
--   worked out from the number — the judge no longer picks it.
--
-- WHAT
--   • departments.judge_from / judge_to   — the department's judge numbers (NULL = none)
--   • trigger: a new department is numbered after the school's last number
--   • backfill: existing departments numbered in their current order, sized by
--     max_judges (only for schools that have no numbers yet — re-runs never undo an
--     admin's edit)
--   • app_settings 'judge_numbering' = 'school' (DEFAULT when absent) | 'department'
--     ('department' = the old behaviour, numbers restart per department)
--   • register_judge()      — school mode: department from the number, number unique per school
--   • set_judge_numbers()   — admin: save every department's range, validated
--   • remove_judge()        — admin: remove ONE judge + their scores/notes/validation, atomically
--
-- COUPLING — not hard-coupled:
--   Old app + this SQL: the old sign-in still sends a department. If the number is
--     not in that department's range the judge gets a message naming the right one.
--   New app without this SQL: the app sees no judge_from column and keeps the old
--     per-department numbering (logs nothing — it is simply the previous behaviour).
--
-- RE-RUNNABLE. Verify afterwards as anon:
--   curl "$URL/rest/v1/departments?select=name,judge_from,judge_to&school_id=eq.<id>" -H "apikey: <anon>"
--     → every department has a range, no two ranges overlap
-- ════════════════════════════════════════════════════════════════════════════


-- ── PART 1: the columns ────────────────────────────────────────────────────
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS judge_from INT;
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS judge_to   INT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_judge_range_chk') THEN
    ALTER TABLE public.departments ADD CONSTRAINT departments_judge_range_chk CHECK (
      (judge_from IS NULL AND judge_to IS NULL)
      OR (judge_from >= 1 AND judge_to >= judge_from AND judge_to <= 999));
  END IF;
END $$;


-- ── PART 2: new departments are numbered after the school's last number ───────
-- Covers every path that creates a department (create_school(), the app's seed,
-- + Add, presets) without touching any of them.
CREATE OR REPLACE FUNCTION public.departments_assign_judge_range()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_last int;
  v_size int := GREATEST(COALESCE(NEW.max_judges, 5), 1);
BEGIN
  IF NEW.judge_from IS NULL AND NEW.judge_to IS NULL THEN
    SELECT COALESCE(max(judge_to), 0) INTO v_last
      FROM departments WHERE school_id = NEW.school_id;
    IF v_last + v_size <= 999 THEN
      NEW.judge_from := v_last + 1;
      NEW.judge_to   := v_last + v_size;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS departments_assign_judge_range ON public.departments;
CREATE TRIGGER departments_assign_judge_range
  BEFORE INSERT ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.departments_assign_judge_range();


-- ── PART 3: backfill existing schools ───────────────────────────────────────
-- Only schools with NO numbers yet, so a re-run never overwrites what an admin set
-- (including a department deliberately given no judges).
DO $$
DECLARE
  r      record;
  v_last int;
BEGIN
  FOR r IN
    SELECT d.id, d.school_id, GREATEST(d.max_judges, 1) AS size
      FROM departments d
     WHERE NOT EXISTS (SELECT 1 FROM departments x
                        WHERE x.school_id = d.school_id AND x.judge_from IS NOT NULL)
     ORDER BY d.school_id, d.ord, d.name
  LOOP
    SELECT COALESCE(max(judge_to), 0) INTO v_last FROM departments WHERE school_id = r.school_id;
    IF v_last + r.size <= 999 THEN
      UPDATE departments SET judge_from = v_last + 1, judge_to = v_last + r.size WHERE id = r.id;
    END IF;
  END LOOP;
END $$;


-- ── PART 4: which numbering a school uses ───────────────────────────────────
-- 'school' unless the admin explicitly chose the old per-department numbering.
CREATE OR REPLACE FUNCTION public.judge_numbering_mode(p_school_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM app_settings
                            WHERE school_id = p_school_id AND key = 'judge_numbering'
                              AND value = 'department')
              THEN 'department' ELSE 'school' END
$$;


-- ── PART 5: register_judge() ────────────────────────────────────────────────
-- Same signature as 2026-09b so the app needs no change to call it. In school mode
-- p_department_id is only a hint: the number decides the department.
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
  v_existing judges%ROWTYPE;
  v_alias    text := btrim(COALESCE(p_alias, ''));
  v_num      int;
  v_max      int;
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

  v_mode := judge_numbering_mode(p_school_id);
  IF v_alias ~ '^Judge[0-9]{1,3}$' THEN
    v_num   := substr(v_alias, 6)::int;
    v_alias := 'Judge' || v_num;          -- "Judge01" and "Judge1" are the same judge
  END IF;

  IF v_mode = 'school' THEN
    -- ── One list for the whole school ──
    SELECT max(judge_to) INTO v_max FROM departments WHERE school_id = p_school_id;
    IF v_num IS NULL OR v_num < 1 THEN
      RAISE EXCEPTION 'Enter your judge number (1 - %).', COALESCE(v_max, 0) USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_dept FROM departments
     WHERE school_id = p_school_id AND judge_from IS NOT NULL
       AND v_num BETWEEN judge_from AND judge_to
     ORDER BY ord LIMIT 1;
    IF v_dept.id IS NULL THEN
      RAISE EXCEPTION 'Judge % is not on this school''s judge list. Check your number with the coordinator.',
        v_num USING ERRCODE = 'P0001';
    END IF;
    -- The number is unique across the school, whatever department an older row is in.
    SELECT * INTO v_existing FROM judges
     WHERE school_id = p_school_id AND alias = v_alias
     ORDER BY joined_at LIMIT 1;
  ELSE
    -- ── Numbers restart in every department (pre-2026-10g behaviour) ──
    SELECT * INTO v_dept FROM departments
     WHERE id = p_department_id AND school_id = p_school_id;
    IF v_dept.id IS NULL THEN
      RAISE EXCEPTION 'Please select your department.' USING ERRCODE = 'P0001';
    END IF;
    IF v_num IS NULL OR v_num < 1 OR v_num > v_dept.max_judges THEN
      RAISE EXCEPTION 'Invalid judge name. Use Judge1 - Judge% for %.',
        v_dept.max_judges, v_dept.name USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v_existing FROM judges
     WHERE school_id = p_school_id AND department_id = p_department_id AND alias = v_alias;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    -- Already signed in somewhere: only proceed if the admin pre-approved a
    -- device transfer and the approval has not expired.
    SELECT NULLIF(value, '')::jsonb INTO v_allow FROM app_settings
     WHERE school_id = p_school_id AND key = 'judge_transfer_allowances';
    v_allow := COALESCE(v_allow, '{}'::jsonb);
    v_until := GREATEST(
      COALESCE((v_allow ->> (v_existing.department_id::text || ':' || v_alias))::bigint, 0),
      COALESCE((v_allow ->> v_alias)::bigint, 0)
    );
    IF v_until < v_now_ms THEN
      RAISE EXCEPTION '% is already signed in. Ask the admin to approve a device transfer.',
        v_alias USING ERRCODE = 'P0001';
    END IF;
    -- Consume the one-time approval.
    v_allow := (v_allow - (v_existing.department_id::text || ':' || v_alias)) - v_alias;
    UPDATE app_settings SET value = v_allow::text
     WHERE school_id = p_school_id AND key = 'judge_transfer_allowances';
    RETURN to_jsonb(v_existing);
  END IF;

  IF v_mode = 'department' THEN
    SELECT count(*) INTO v_count FROM judges
     WHERE school_id = p_school_id AND department_id = v_dept.id;
    IF v_count >= v_dept.max_judges THEN
      RAISE EXCEPTION '% is full (%/%). Contact admin.',
        v_dept.name, v_count, v_dept.max_judges USING ERRCODE = 'P0001';
    END IF;
  END IF;
  -- (School mode needs no head-count: each number is one seat.)

  -- Every judge scores every project in their department.
  SELECT COALESCE(jsonb_agg(id ORDER BY num), '[]'::jsonb) INTO v_projects
    FROM projects WHERE school_id = p_school_id AND department_id = v_dept.id;

  v_id := 'j_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);

  INSERT INTO judges (id, school_id, alias, projects, department_id)
  VALUES (v_id, p_school_id, v_alias, v_projects, v_dept.id);

  SELECT * INTO v_existing FROM judges WHERE id = v_id AND school_id = p_school_id;
  RETURN to_jsonb(v_existing);
END $$;


-- ── PART 6: set_judge_numbers() — admin saves the judge list ────────────────
-- p_ranges = [{"department_id": uuid, "from": int|null, "to": int|null}, …]
-- Departments not listed keep their current range. Refuses overlaps, and refuses
-- any change that would leave a signed-in judge outside their department's numbers.
CREATE OR REPLACE FUNCTION public.set_judge_numbers(p_school_id uuid, p_ranges jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bad record;
BEGIN
  IF NOT is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_ranges) <> 'array' THEN
    RAISE EXCEPTION 'Expected a list of departments.' USING ERRCODE = 'P0001';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _jn (id uuid PRIMARY KEY, name text, f int, t int) ON COMMIT DROP;
  DELETE FROM _jn;
  INSERT INTO _jn SELECT id, name, judge_from, judge_to FROM departments WHERE school_id = p_school_id;

  -- Apply the requested ranges.
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

  -- No number may belong to two departments.
  SELECT a.name AS a, b.name AS b INTO v_bad
    FROM _jn a JOIN _jn b ON a.id < b.id
   WHERE a.f IS NOT NULL AND b.f IS NOT NULL AND a.f <= b.t AND b.f <= a.t
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '% and % would share judge numbers.', v_bad.a, v_bad.b USING ERRCODE = 'P0001';
  END IF;

  -- Every signed-in judge must keep a number inside their own department.
  SELECT j.alias, d.name, d.f, d.t INTO v_bad
    FROM judges j JOIN _jn d ON d.id = j.department_id
   WHERE j.school_id = p_school_id AND j.alias ~ '^Judge[0-9]+$'
     AND (d.f IS NULL OR substr(j.alias, 6)::int NOT BETWEEN d.f AND d.t)
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '% is signed in to % but would be outside its numbers (%). Remove that judge on the Judges tab first, or keep the number in range.',
      v_bad.alias, v_bad.name,
      CASE WHEN v_bad.f IS NULL THEN 'none' ELSE v_bad.f || '–' || v_bad.t END
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE departments d
     SET judge_from = n.f, judge_to = n.t,
         max_judges = CASE WHEN n.f IS NULL THEN d.max_judges ELSE n.t - n.f + 1 END
    FROM _jn n
   WHERE d.id = n.id AND d.school_id = p_school_id;
END $$;


-- ── PART 7: remove_judge() — admin removes ONE judge ────────────────────────
-- Before this the only way to undo a wrong sign-in was Reset All Data. Deletes the
-- judge's scores, deliberation notes and validation with them (no orphans), in one
-- transaction. Returns how many scores were removed so the app can report it.
CREATE OR REPLACE FUNCTION public.remove_judge(p_school_id uuid, p_judge_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_alias  text;
  v_scores int;
BEGIN
  IF NOT is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'P0001';
  END IF;
  SELECT alias INTO v_alias FROM judges WHERE id = p_judge_id AND school_id = p_school_id;
  IF v_alias IS NULL THEN
    RAISE EXCEPTION 'That judge no longer exists.' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM scores             WHERE school_id = p_school_id AND judge_id = p_judge_id;
  GET DIAGNOSTICS v_scores = ROW_COUNT;
  DELETE FROM deliberation_notes WHERE school_id = p_school_id AND judge_id = p_judge_id;
  DELETE FROM validations        WHERE school_id = p_school_id AND judge_id = p_judge_id;
  DELETE FROM judges             WHERE school_id = p_school_id AND id = p_judge_id;

  RETURN jsonb_build_object('alias', v_alias, 'scores', v_scores);
END $$;

GRANT EXECUTE ON FUNCTION public.judge_numbering_mode(uuid)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_judge_numbers(uuid, jsonb)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_judge(uuid, text)          TO authenticated;
