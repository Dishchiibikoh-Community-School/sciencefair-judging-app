-- ════════════════════════════════════════════════════════════════════════════
-- Migration 2026-10h — departments can share judges (optional)
-- ════════════════════════════════════════════════════════════════════════════
-- WHY
--   ~15 judges for six departments: a small fair needs one judge to cover several
--   departments (e.g. the same 3 judges for PreK and K-2). Until now a judge belonged
--   to exactly one department and their project list held only its projects.
--
-- HOW
--   With one judge list for the school (2026-10g) each department owns a range of
--   judge numbers. Ranges may now OVERLAP: a judge whose number is inside several
--   ranges covers all of those departments and scores every project in them.
--   Because whole ranges are shared, every project in a department is still scored
--   by the same panel — the averages stay comparable.
--
--   Default is unchanged: the Setup tab hands out non-overlapping numbers from counts.
--   Sharing is opt-in there (app_settings 'judge_sharing' = 'on', UI preference only —
--   the server accepts whatever ranges the admin saves).
--
-- WHAT
--   • judges.department_ids  jsonb array of department ids the judge covers
--     (department_id stays: it is the judge's FIRST department, kept for every
--     existing reader). Backfilled to [department_id].
--   • register_judge()     — school mode: covers EVERY department whose range holds the number
--   • set_judge_numbers()  — overlaps allowed; re-syncs every signed-in judge's departments
--     and projects; refuses any change that would take a department AWAY from a signed-in
--     judge (they may gain departments, never silently lose one)
--
-- COUPLING — run this, then deploy the matching app (or the other way round):
--   New app without this SQL: judges have no department_ids → the app uses
--     [department_id]; the Setup tab refuses overlapping ranges (2026-10g server).
--   Old app with this SQL: works; a shared judge's extra projects show in their list
--     (judges.projects), the Judges tab lists them under their first department only.
--
-- ⚠️ set_judge_numbers() here is SUPERSEDED by 2026-10i (adds the maximum judge number).
--   If you re-run THIS file, re-run migration-2026-10i-judge-max.sql straight after.
--
-- RE-RUNNABLE.
-- ════════════════════════════════════════════════════════════════════════════


-- ── PART 1: a judge can cover several departments ───────────────────────────
ALTER TABLE public.judges ADD COLUMN IF NOT EXISTS department_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.judges
   SET department_ids = jsonb_build_array(department_id::text)
 WHERE department_id IS NOT NULL
   AND (department_ids IS NULL OR department_ids = '[]'::jsonb);


-- ── PART 2: register_judge() ────────────────────────────────────────────────
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
    -- ── One list for the whole school; a number may cover several departments ──
    SELECT max(judge_to) INTO v_max FROM departments WHERE school_id = p_school_id;
    IF v_num IS NULL OR v_num < 1 THEN
      RAISE EXCEPTION 'Enter your judge number (1 - %).', COALESCE(v_max, 0) USING ERRCODE = 'P0001';
    END IF;
    -- First department (by order) is the judge's primary one.
    SELECT * INTO v_dept FROM departments
     WHERE school_id = p_school_id AND judge_from IS NOT NULL
       AND v_num BETWEEN judge_from AND judge_to
     ORDER BY ord, name LIMIT 1;
    IF v_dept.id IS NULL THEN
      RAISE EXCEPTION 'Judge % is not on this school''s judge list. Check your number with the coordinator.',
        v_num USING ERRCODE = 'P0001';
    END IF;
    SELECT jsonb_agg(id::text ORDER BY ord, name) INTO v_dept_ids FROM departments
     WHERE school_id = p_school_id AND judge_from IS NOT NULL
       AND v_num BETWEEN judge_from AND judge_to;
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
    v_dept_ids := jsonb_build_array(v_dept.id::text);
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

  -- Every judge scores every project in every department they cover.
  SELECT COALESCE(jsonb_agg(p.id ORDER BY d.ord, p.num), '[]'::jsonb) INTO v_projects
    FROM projects p JOIN departments d ON d.id = p.department_id
   WHERE p.school_id = p_school_id
     AND p.department_id::text IN (SELECT jsonb_array_elements_text(v_dept_ids));

  v_id := 'j_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);

  INSERT INTO judges (id, school_id, alias, projects, department_id, department_ids)
  VALUES (v_id, p_school_id, v_alias, v_projects, v_dept.id, v_dept_ids);

  SELECT * INTO v_existing FROM judges WHERE id = v_id AND school_id = p_school_id;
  RETURN to_jsonb(v_existing);
END $$;


-- ── PART 3: set_judge_numbers() — overlaps allowed, judges re-synced ────────
CREATE OR REPLACE FUNCTION public.set_judge_numbers(p_school_id uuid, p_ranges jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bad record;
  v_school_mode boolean;
BEGIN
  IF NOT is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_ranges) <> 'array' THEN
    RAISE EXCEPTION 'Expected a list of departments.' USING ERRCODE = 'P0001';
  END IF;
  v_school_mode := judge_numbering_mode(p_school_id) = 'school';

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

  -- (Overlapping ranges are allowed since 2026-10h: that is how departments share judges.)

  IF v_school_mode THEN
    -- Each signed-in judge's departments under the NEW ranges.
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

    -- A judge may GAIN departments, never silently LOSE one: they were told where to
    -- sit, and scores they gave there would stop matching their list.
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
    -- Re-sync every signed-in judge: departments, primary department, project list.
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
