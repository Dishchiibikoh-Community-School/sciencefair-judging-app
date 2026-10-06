-- ════════════════════════════════════════════════════════════════════════════
-- Migration 2026-10k — judge roster grid + "N judges per project" panels
-- ════════════════════════════════════════════════════════════════════════════
-- WHY
--   1. Judge numbers were From–To RANGES per department (2026-10g/h). Ranges cannot express
--      every sharing pattern (A+B share #1, B+C share #2, A+C share #3 is impossible) and
--      the screen was hard to read. Now each judge NUMBER is ticked into the departments it
--      covers: a roster (number ↔ department, many-to-many).
--   2. Every judge scored every project in their department. 6-8 has 31 projects: ~3 hours
--      per judge. A department can now set "N judges per project" (e.g. 3): each project is
--      assigned to N judge numbers from the department's roster, balanced so each judge gets
--      about the same number. Leaving it empty keeps the old behaviour (everyone scores all).
--
-- WHAT
--   • judge_roster(school_id, judge_number, department_id)   — public read, RPC-only writes
--   • judge_labels(school_id, judge_number, label)            — ADMIN-ONLY private names
--   • departments.judges_per_project  INT NULL (NULL = every judge scores every project)
--   • project_judges(school_id, project_id, judge_number)     — stored panel assignments
--     (stored, not recomputed: a late project never reshuffles anyone's list mid-event)
--   • register_judge()      — departments + projects come from the roster / panels
--   • set_judge_roster()    — admin saves the grid (same rules as before: numbers ≤ the
--                             maximum, a signed-in judge may GAIN departments, never lose one)
--   • set_judge_numbers()   — kept for old cached app versions: converts ranges to a roster
--   • set_judges_per_project(), assign_panels('fill'|'rebuild'|'rebalance'),
--     sync_judge_projects()  — admin panel management; NEVER removes a scored assignment
--   • set_judge_max()       — the maximum is checked against the roster
--   • departments: new rows still get a default block of numbers, now also in the roster;
--     the guard trigger also locks judges_per_project once a department has scores
--
-- ⚠️ SUPERSEDES register_judge() (10h), set_judge_numbers() (10i), set_judge_max() (10i),
--   departments_assign_judge_range() (10i) and departments_guard_judging() (10j).
--   If you re-run any of those files, re-run THIS one straight after.
--
-- COUPLING — run this, then deploy the matching app straight away. The previous app keeps
--   working (its range editor saves through set_judge_numbers → roster) but cannot show the
--   grid or panels.
--
-- RE-RUNNABLE. No bare DELETE/UPDATE anywhere (Supabase pg-safeupdate — see 2026-10i fix).
-- ════════════════════════════════════════════════════════════════════════════


-- ── PART 1: tables ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.judge_roster (
  school_id     UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  judge_number  INT  NOT NULL CHECK (judge_number BETWEEN 1 AND 999),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  PRIMARY KEY (school_id, judge_number, department_id)
);
ALTER TABLE public.judge_roster ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "judge_roster_select" ON public.judge_roster;
DROP POLICY IF EXISTS "judge_roster_insert" ON public.judge_roster;
DROP POLICY IF EXISTS "judge_roster_update" ON public.judge_roster;
DROP POLICY IF EXISTS "judge_roster_delete" ON public.judge_roster;
-- Read open: the judge sign-in screen shows "Judge 7 · 6-8" before signing in. No names.
CREATE POLICY "judge_roster_select" ON public.judge_roster FOR SELECT USING (true);
CREATE POLICY "judge_roster_insert" ON public.judge_roster FOR INSERT WITH CHECK (false);
CREATE POLICY "judge_roster_update" ON public.judge_roster FOR UPDATE USING (false);
CREATE POLICY "judge_roster_delete" ON public.judge_roster FOR DELETE USING (false);

-- Who is behind each number ("Judge 5 = Ms. Rabah"). Personal data → admins only, and anon
-- gets no privileges at all (Realtime enforces the same RLS).
CREATE TABLE IF NOT EXISTS public.judge_labels (
  school_id    UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  judge_number INT  NOT NULL CHECK (judge_number BETWEEN 1 AND 999),
  label        TEXT NOT NULL DEFAULT '' CHECK (char_length(label) <= 80),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, judge_number)
);
ALTER TABLE public.judge_labels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "judge_labels_select" ON public.judge_labels;
DROP POLICY IF EXISTS "judge_labels_insert" ON public.judge_labels;
DROP POLICY IF EXISTS "judge_labels_update" ON public.judge_labels;
DROP POLICY IF EXISTS "judge_labels_delete" ON public.judge_labels;
CREATE POLICY "judge_labels_select" ON public.judge_labels FOR SELECT USING (is_school_admin(school_id));
CREATE POLICY "judge_labels_insert" ON public.judge_labels FOR INSERT WITH CHECK (is_school_admin(school_id));
CREATE POLICY "judge_labels_update" ON public.judge_labels FOR UPDATE USING (is_school_admin(school_id));
CREATE POLICY "judge_labels_delete" ON public.judge_labels FOR DELETE USING (is_school_admin(school_id));
REVOKE ALL ON public.judge_labels FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.judge_labels TO authenticated;

ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS judges_per_project INT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_judges_per_project_chk') THEN
    ALTER TABLE public.departments ADD CONSTRAINT departments_judges_per_project_chk
      CHECK (judges_per_project IS NULL OR judges_per_project BETWEEN 1 AND 10);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.project_judges (
  school_id    UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  project_id   TEXT NOT NULL,
  judge_number INT  NOT NULL CHECK (judge_number BETWEEN 1 AND 999),
  PRIMARY KEY (project_id, school_id, judge_number),
  FOREIGN KEY (project_id, school_id) REFERENCES public.projects(id, school_id) ON DELETE CASCADE
);
ALTER TABLE public.project_judges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_judges_select" ON public.project_judges;
DROP POLICY IF EXISTS "project_judges_insert" ON public.project_judges;
DROP POLICY IF EXISTS "project_judges_update" ON public.project_judges;
DROP POLICY IF EXISTS "project_judges_delete" ON public.project_judges;
CREATE POLICY "project_judges_select" ON public.project_judges FOR SELECT USING (true);
CREATE POLICY "project_judges_insert" ON public.project_judges FOR INSERT WITH CHECK (false);
CREATE POLICY "project_judges_update" ON public.project_judges FOR UPDATE USING (false);
CREATE POLICY "project_judges_delete" ON public.project_judges FOR DELETE USING (false);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['judge_roster','judge_labels','project_judges'] LOOP
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;


-- ── PART 2: backfill the roster from today's ranges ─────────────────────────
-- Only schools with an empty roster, so a re-run never resurrects a number the admin removed.
INSERT INTO public.judge_roster (school_id, judge_number, department_id)
SELECT d.school_id, n, d.id
  FROM public.departments d
  CROSS JOIN LATERAL generate_series(d.judge_from, d.judge_to) AS n
 WHERE d.judge_from IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.judge_roster r WHERE r.school_id = d.school_id)
ON CONFLICT DO NOTHING;


-- ── PART 3: internal helpers (not callable through the API) ─────────────────
-- Departments a judge number covers, in department order.
CREATE OR REPLACE FUNCTION public._judge_dept_ids(p_school uuid, p_num int)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(d.id::text ORDER BY d.ord, d.name), '[]'::jsonb)
    FROM judge_roster r JOIN departments d ON d.id = r.department_id
   WHERE r.school_id = p_school AND r.judge_number = p_num
$$;

-- Projects a judge number scores: every project of an "all judges" department, and only
-- the assigned ones of a panel department (judges_per_project set).
CREATE OR REPLACE FUNCTION public._judge_projects(p_school uuid, p_num int, p_dept_ids jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(p.id ORDER BY d.ord, p.num), '[]'::jsonb)
    FROM projects p JOIN departments d ON d.id = p.department_id
   WHERE p.school_id = p_school
     AND p_dept_ids ? p.department_id::text
     AND (d.judges_per_project IS NULL
          OR EXISTS (SELECT 1 FROM project_judges pj
                      WHERE pj.school_id = p_school AND pj.project_id = p.id AND pj.judge_number = p_num))
$$;

-- Re-sync every signed-in judge (school numbering) from roster + panels.
CREATE OR REPLACE FUNCTION public._resync_judges(p_school uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF judge_numbering_mode(p_school) <> 'school' THEN RETURN; END IF;
  UPDATE judges j
     SET department_ids = x.ids,
         department_id  = CASE WHEN x.ids ? j.department_id::text THEN j.department_id ELSE (x.ids ->> 0)::uuid END,
         projects       = _judge_projects(p_school, x.num, x.ids)
    FROM (SELECT jj.id, substr(jj.alias, 6)::int AS num, _judge_dept_ids(p_school, substr(jj.alias, 6)::int) AS ids
            FROM judges jj
           WHERE jj.school_id = p_school AND jj.alias ~ '^Judge[0-9]{1,3}$') x
   WHERE j.id = x.id AND j.school_id = p_school AND jsonb_array_length(x.ids) > 0;
END $$;

-- Has the judge behind this number scored this project? (Their assignment is then permanent.)
CREATE OR REPLACE FUNCTION public._seat_scored(p_school uuid, p_project text, p_num int)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM scores s JOIN judges j ON j.id = s.judge_id AND j.school_id = s.school_id
                  WHERE s.school_id = p_school AND s.project_id = p_project AND j.alias = 'Judge' || p_num)
$$;

-- Fill a panel department: drop UNSCORED assignments of seats outside p_seats, then give
-- every project up to N judges from p_seats, always choosing the least-loaded seat (ties
-- rotate with the project so pairings vary). Never removes a scored assignment.
-- p_only_empty: only projects with NO judges yet (new / moved-in projects). Used by the
-- automatic sync after a project change, so it never tops up projects an admin left short
-- on purpose — e.g. after a Rebalance it must not hand work back to judges who are absent.
DROP FUNCTION IF EXISTS public._fill_panels(uuid, uuid, int[]);
CREATE OR REPLACE FUNCTION public._fill_panels(p_school uuid, p_dept uuid, p_seats int[], p_only_empty boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_n    int;
  v_k    int := COALESCE(array_length(p_seats, 1), 0);
  r      record;
  v_have int;
  v_seat int;
  v_i    int := 0;
BEGIN
  SELECT judges_per_project INTO v_n FROM departments WHERE id = p_dept AND school_id = p_school;
  IF v_n IS NULL THEN RETURN; END IF;

  DELETE FROM project_judges pj
   USING projects p
   WHERE pj.school_id = p_school AND pj.project_id = p.id AND p.school_id = p_school
     AND p.department_id = p_dept
     AND NOT (pj.judge_number = ANY (COALESCE(p_seats, '{}'::int[])))
     AND NOT _seat_scored(p_school, pj.project_id, pj.judge_number);

  IF v_k = 0 THEN RETURN; END IF;
  FOR r IN SELECT id FROM projects WHERE school_id = p_school AND department_id = p_dept ORDER BY num, id LOOP
    v_i := v_i + 1;
    SELECT count(*) INTO v_have FROM project_judges WHERE school_id = p_school AND project_id = r.id;
    CONTINUE WHEN p_only_empty AND v_have > 0;
    WHILE v_have < v_n LOOP
      SELECT s INTO v_seat
        FROM unnest(p_seats) WITH ORDINALITY AS u(s, idx)
       WHERE NOT EXISTS (SELECT 1 FROM project_judges pj
                          WHERE pj.school_id = p_school AND pj.project_id = r.id AND pj.judge_number = u.s)
       ORDER BY (SELECT count(*) FROM project_judges pj JOIN projects pp ON pp.id = pj.project_id AND pp.school_id = pj.school_id
                  WHERE pj.school_id = p_school AND pj.judge_number = u.s AND pp.department_id = p_dept),
                ((idx - 1 - v_i) % v_k + v_k) % v_k
       LIMIT 1;
      EXIT WHEN v_seat IS NULL;     -- fewer seats than N: coverage warning in the app
      INSERT INTO project_judges (school_id, project_id, judge_number) VALUES (p_school, r.id, v_seat);
      v_have := v_have + 1;
    END LOOP;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public._judge_dept_ids(uuid, int), public._judge_projects(uuid, int, jsonb),
  public._resync_judges(uuid), public._seat_scored(uuid, text, int), public._fill_panels(uuid, uuid, int[], boolean)
  FROM PUBLIC, anon, authenticated;


-- ── PART 4: register_judge() — departments + projects from roster / panels ──
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
    PERFORM note_auth_failure(p_school_id, 'invite');
    RAISE EXCEPTION 'Invalid invite code' USING ERRCODE = 'P0001';
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


-- ── PART 5: set_judge_roster() — the admin saves the grid ───────────────────
-- p_roster = [{"number": 1, "department_ids": ["<uuid>", …]}, …] — the WHOLE roster.
CREATE OR REPLACE FUNCTION public.set_judge_roster(p_school_id uuid, p_roster jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max int;
  v_bad record;
  d     record;
BEGIN
  IF NOT is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_roster) <> 'array' THEN
    RAISE EXCEPTION 'Expected a list of judge numbers.' USING ERRCODE = 'P0001';
  END IF;
  v_max := judge_max(p_school_id);

  DROP TABLE IF EXISTS pg_temp._jr;
  CREATE TEMP TABLE _jr (num int, dept uuid) ON COMMIT DROP;
  INSERT INTO _jr
  SELECT DISTINCT (e ->> 'number')::int, (x)::uuid
    FROM jsonb_array_elements(p_roster) e
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(e -> 'department_ids', '[]'::jsonb)) AS x;

  SELECT num INTO v_bad FROM _jr WHERE num IS NULL OR num < 1 OR num > v_max ORDER BY num LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Judge % is outside 1–% (the maximum). Raise the maximum (up to 90) first.',
      COALESCE(v_bad.num::text, '?'), v_max USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM _jr r WHERE NOT EXISTS
               (SELECT 1 FROM departments d2 WHERE d2.id = r.dept AND d2.school_id = p_school_id)) THEN
    RAISE EXCEPTION 'Unknown department.' USING ERRCODE = 'P0001';
  END IF;

  -- A signed-in judge may GAIN departments, never silently LOSE one.
  IF judge_numbering_mode(p_school_id) = 'school' THEN
    SELECT j.alias, dd.name INTO v_bad
      FROM judges j
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_array_length(COALESCE(j.department_ids, '[]'::jsonb)) > 0 THEN j.department_ids
             WHEN j.department_id IS NOT NULL THEN jsonb_build_array(j.department_id::text)
             ELSE '[]'::jsonb END) AS o(dept)
      JOIN departments dd ON dd.id::text = o.dept
     WHERE j.school_id = p_school_id AND j.alias ~ '^Judge[0-9]{1,3}$'
       AND NOT EXISTS (SELECT 1 FROM _jr r WHERE r.num = substr(j.alias, 6)::int AND r.dept::text = o.dept)
     LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION '% is signed in to % and would lose it. Remove that judge on the Judges tab first, or keep them ticked for %.',
        v_bad.alias, v_bad.name, v_bad.name USING ERRCODE = 'P0001';
    END IF;
  END IF;

  DELETE FROM judge_roster WHERE school_id = p_school_id;
  INSERT INTO judge_roster (school_id, judge_number, department_id)
  SELECT p_school_id, num, dept FROM _jr;

  -- Keep the old range columns roughly in step for any cached older app (display only).
  UPDATE departments dd
     SET judge_from = x.f, judge_to = x.t,
         max_judges = CASE WHEN x.c > 0 THEN x.c ELSE dd.max_judges END
    FROM (SELECT d3.id, min(r.num) AS f, max(r.num) AS t, count(r.num)::int AS c
            FROM departments d3 LEFT JOIN _jr r ON r.dept = d3.id
           WHERE d3.school_id = p_school_id GROUP BY d3.id) x
   WHERE dd.id = x.id AND dd.school_id = p_school_id;

  -- Panels follow the roster: unscored work of removed numbers is redistributed.
  FOR d IN SELECT id FROM departments WHERE school_id = p_school_id AND judges_per_project IS NOT NULL LOOP
    PERFORM _fill_panels(p_school_id, d.id,
      ARRAY(SELECT num FROM _jr WHERE dept = d.id ORDER BY num));
  END LOOP;
  PERFORM _resync_judges(p_school_id);
END $$;
GRANT EXECUTE ON FUNCTION public.set_judge_roster(uuid, jsonb) TO authenticated;

-- Older cached app versions still save From–To ranges: turn them into a roster.
CREATE OR REPLACE FUNCTION public.set_judge_numbers(p_school_id uuid, p_ranges jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_roster jsonb;
  v_max    int;
  v_rg     record;   -- not "r": that is the judge_roster alias below
BEGIN
  IF NOT is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_ranges) <> 'array' THEN
    RAISE EXCEPTION 'Expected a list of departments.' USING ERRCODE = 'P0001';
  END IF;
  -- Same checks and messages as the range editor always had (2026-10g/10i).
  v_max := judge_max(p_school_id);
  FOR v_rg IN SELECT (e ->> 'department_id')::uuid AS id, NULLIF(e ->> 'from', '')::int AS f, NULLIF(e ->> 'to', '')::int AS t
             FROM jsonb_array_elements(p_ranges) e LOOP
    IF NOT EXISTS (SELECT 1 FROM departments WHERE id = v_rg.id AND school_id = p_school_id) THEN
      RAISE EXCEPTION 'Unknown department.' USING ERRCODE = 'P0001';
    END IF;
    IF (v_rg.f IS NULL) <> (v_rg.t IS NULL) OR (v_rg.f IS NOT NULL AND (v_rg.f < 1 OR v_rg.t < v_rg.f OR v_rg.t > 999)) THEN
      RAISE EXCEPTION 'Judge numbers must run from 1 to 999, lowest first.' USING ERRCODE = 'P0001';
    END IF;
    IF v_rg.t > v_max THEN
      RAISE EXCEPTION '% would use judge numbers up to %, but the maximum is %. Raise the maximum (up to 90) first.',
        (SELECT name FROM departments WHERE id = v_rg.id), v_rg.t, v_max USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  WITH cur AS (   -- departments not mentioned keep their current numbers
    SELECT r.judge_number AS num, r.department_id AS dept FROM judge_roster r
     WHERE r.school_id = p_school_id
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_ranges) e WHERE (e ->> 'department_id')::uuid = r.department_id)
  ), req AS (
    SELECT n AS num, (e ->> 'department_id')::uuid AS dept
      FROM jsonb_array_elements(p_ranges) e
      CROSS JOIN LATERAL generate_series(NULLIF(e ->> 'from', '')::int, NULLIF(e ->> 'to', '')::int) AS n
  ), allr AS (SELECT * FROM cur UNION SELECT * FROM req)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('number', num, 'department_ids', ids)), '[]'::jsonb) INTO v_roster
    FROM (SELECT num, jsonb_agg(dept::text) AS ids FROM allr GROUP BY num) g;
  PERFORM set_judge_roster(p_school_id, v_roster);
END $$;
GRANT EXECUTE ON FUNCTION public.set_judge_numbers(uuid, jsonb) TO authenticated;


-- ── PART 6: the maximum is checked against the roster ───────────────────────
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
  SELECT r.judge_number, d.name INTO v_top, v_name
    FROM judge_roster r JOIN departments d ON d.id = r.department_id
   WHERE r.school_id = p_school_id ORDER BY r.judge_number DESC, d.ord LIMIT 1;
  IF v_top IS NOT NULL AND v_top > p_max THEN
    RAISE EXCEPTION 'Judge numbers already go up to % (%). Lower the department numbers first, then the maximum.',
      v_top, v_name USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO app_settings (school_id, key, value) VALUES (p_school_id, 'judge_max', p_max::text)
  ON CONFLICT (school_id, key) DO UPDATE SET value = EXCLUDED.value;
END $$;
GRANT EXECUTE ON FUNCTION public.set_judge_max(uuid, int) TO authenticated;


-- ── PART 7: new departments still get a block of numbers — now in the roster too ──
CREATE OR REPLACE FUNCTION public.departments_assign_judge_range()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_last int;
  v_size int := GREATEST(COALESCE(NEW.max_judges, 5), 1);
BEGIN
  IF NEW.judge_from IS NULL AND NEW.judge_to IS NULL THEN
    SELECT GREATEST(COALESCE((SELECT max(judge_to) FROM departments WHERE school_id = NEW.school_id), 0),
                    COALESCE((SELECT max(judge_number) FROM judge_roster WHERE school_id = NEW.school_id), 0))
      INTO v_last;
    IF v_last + v_size <= judge_max(NEW.school_id) THEN
      NEW.judge_from := v_last + 1;
      NEW.judge_to   := v_last + v_size;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.departments_seed_roster()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.judge_from IS NOT NULL AND NEW.judge_to IS NOT NULL THEN
    INSERT INTO judge_roster (school_id, judge_number, department_id)
    SELECT NEW.school_id, n, NEW.id FROM generate_series(NEW.judge_from, NEW.judge_to) AS n
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS departments_seed_roster ON public.departments;
CREATE TRIGGER departments_seed_roster
  AFTER INSERT ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.departments_seed_roster();

-- Guard (2026-10j) + judges_per_project: none of these may change once a department has scores.
CREATE OR REPLACE FUNCTION public.departments_guard_judging()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_default uuid;
BEGIN
  IF NEW.rubric_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM rubrics WHERE id = NEW.rubric_id AND school_id = NEW.school_id) THEN
    RAISE EXCEPTION 'That rubric does not belong to this school.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT id INTO v_default FROM rubrics WHERE school_id = OLD.school_id AND is_active LIMIT 1;
    IF (COALESCE(NEW.rubric_id, v_default) IS DISTINCT FROM COALESCE(OLD.rubric_id, v_default)
        OR NEW.scoring_mode IS DISTINCT FROM OLD.scoring_mode
        OR NEW.judges_per_project IS DISTINCT FROM OLD.judges_per_project)
       AND EXISTS (SELECT 1 FROM scores s JOIN projects p ON p.id = s.project_id AND p.school_id = s.school_id
                    WHERE p.department_id = OLD.id AND s.school_id = OLD.school_id) THEN
      RAISE EXCEPTION '% already has scores. Changing how it is judged now would make those scores count differently. Remove those scores first (Reset All Data, or remove the judges who gave them).',
        OLD.name USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;


-- ── PART 8: panels — admin RPCs ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_panels(p_school_id uuid, p_department_id uuid, p_mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_n     int;
  v_seats int[];
  v_short int;
BEGIN
  IF NOT is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'P0001';
  END IF;
  IF p_mode NOT IN ('fill', 'rebuild', 'rebalance') THEN
    RAISE EXCEPTION 'Unknown mode.' USING ERRCODE = 'P0001';
  END IF;
  SELECT judges_per_project INTO v_n FROM departments WHERE id = p_department_id AND school_id = p_school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown department.' USING ERRCODE = 'P0001'; END IF;
  IF v_n IS NULL THEN
    PERFORM _resync_judges(p_school_id);
    RETURN jsonb_build_object('judges_per_project', null);
  END IF;

  v_seats := ARRAY(SELECT judge_number FROM judge_roster
                    WHERE school_id = p_school_id AND department_id = p_department_id ORDER BY judge_number);
  IF p_mode = 'rebalance' THEN
    -- Only judges who actually signed in keep (unscored) work.
    v_seats := ARRAY(SELECT s FROM unnest(v_seats) s
                      WHERE EXISTS (SELECT 1 FROM judges j WHERE j.school_id = p_school_id AND j.alias = 'Judge' || s));
    IF COALESCE(array_length(v_seats, 1), 0) = 0 THEN
      RAISE EXCEPTION 'No judges have signed in to this department yet — nothing to rebalance onto.' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_mode = 'rebuild' THEN
    DELETE FROM project_judges pj
     USING projects p
     WHERE pj.school_id = p_school_id AND pj.project_id = p.id AND p.school_id = p_school_id
       AND p.department_id = p_department_id
       AND NOT _seat_scored(p_school_id, pj.project_id, pj.judge_number);
  END IF;

  PERFORM _fill_panels(p_school_id, p_department_id, v_seats);
  PERFORM _resync_judges(p_school_id);

  SELECT count(*) INTO v_short FROM projects p
   WHERE p.school_id = p_school_id AND p.department_id = p_department_id
     AND (SELECT count(*) FROM project_judges pj WHERE pj.school_id = p_school_id AND pj.project_id = p.id) < v_n;
  RETURN jsonb_build_object('judges_per_project', v_n, 'seats', COALESCE(array_length(v_seats, 1), 0), 'short', v_short);
END $$;
GRANT EXECUTE ON FUNCTION public.assign_panels(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_judges_per_project(p_school_id uuid, p_department_id uuid, p_n int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'P0001';
  END IF;
  IF p_n IS NOT NULL AND (p_n < 1 OR p_n > 10) THEN
    RAISE EXCEPTION 'Judges per project must be between 1 and 10.' USING ERRCODE = 'P0001';
  END IF;
  -- The guard trigger refuses this once the department has scores.
  UPDATE departments SET judges_per_project = p_n WHERE id = p_department_id AND school_id = p_school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown department.' USING ERRCODE = 'P0001'; END IF;
  IF p_n IS NULL THEN
    DELETE FROM project_judges pj USING projects p
     WHERE pj.school_id = p_school_id AND pj.project_id = p.id AND p.school_id = p_school_id
       AND p.department_id = p_department_id;
    PERFORM _resync_judges(p_school_id);
    RETURN jsonb_build_object('judges_per_project', null);
  END IF;
  RETURN assign_panels(p_school_id, p_department_id, 'rebuild');
END $$;
GRANT EXECUTE ON FUNCTION public.set_judges_per_project(uuid, uuid, int) TO authenticated;

-- After projects are added / moved / removed: give judges to projects that have none (never
-- reshuffles or tops up existing work) and re-sync every judge's project list.
CREATE OR REPLACE FUNCTION public.sync_judge_projects(p_school_id uuid, p_department_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d record;
BEGIN
  IF NOT is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'P0001';
  END IF;
  FOR d IN SELECT id FROM departments
            WHERE school_id = p_school_id AND judges_per_project IS NOT NULL
              AND id = ANY (COALESCE(p_department_ids, '{}'::uuid[])) LOOP
    PERFORM _fill_panels(p_school_id, d.id,
      ARRAY(SELECT judge_number FROM judge_roster WHERE school_id = p_school_id AND department_id = d.id ORDER BY judge_number),
      true);
  END LOOP;
  PERFORM _resync_judges(p_school_id);
END $$;
GRANT EXECUTE ON FUNCTION public.sync_judge_projects(uuid, uuid[]) TO authenticated;
