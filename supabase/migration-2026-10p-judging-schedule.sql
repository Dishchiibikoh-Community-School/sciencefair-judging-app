-- ════════════════════════════════════════════════════════════════════════════
-- Migration 2026-10p — judging schedule (who visits which project, in which round)
-- ════════════════════════════════════════════════════════════════════════════
-- WHY
--   The 2026-27 fair runs on a fixed schedule built by the organiser: 15 judges × 12 rounds of
--   7 minutes (8:30–10:15) with two common breaks, 3 visits per scored project, 1 per PreK /
--   SPED project. The app could only say "every judge scores the whole department" or "N judges
--   per project, chosen by the app" — neither reproduces a hand-built schedule, and neither has
--   rounds or times, so a judge would hunt through an unordered list every 8 minutes.
--
-- WHAT
--   • judge_schedule(school_id, judge_number, round_no, project_id) — one row per visit.
--     Public read (judge numbers + project ids, no names — same as project_judges); writes only
--     through the RPCs. A judge visits a project at most once, and has one project per round.
--     Deleting a project deletes its visits (FK cascade).
--   • app_settings.judging_schedule — the slots as JSON (rounds with times, breaks, wrap-up),
--     exactly as imported, for the judge's screen and the printouts.
--   • _judge_projects() — WHILE A SCHEDULE EXISTS a judge's list is their scheduled projects in
--     round order. Panels / "every judge scores all" apply again once it is removed.
--   • set_judge_schedule(school, slots, entries) — admin: replace the whole schedule. Validates
--     every visit, refuses to drop a visit a judge has ALREADY SCORED, derives the judge grid
--     (each number → the departments of its projects) through set_judge_roster() so sign-in shows
--     the right departments, and re-syncs every signed-in judge.
--   • clear_judge_schedule(school) — admin: remove it; lists go back to the grid / panels.
--
-- ⚠️ SUPERSEDES _judge_projects() from 2026-10k. Re-running 10k re-creates the old body (no
--   schedule) — always re-run THIS file after 10k. register_judge (10m) needs no change: it
--   calls _judge_projects().
--
-- COUPLING — none. ADDITIVE, either order: with no schedule rows every function behaves exactly
--   as before. The new app shows "needs migration 2026-10p" on the schedule card without it.
--
-- RE-RUNNABLE. Every DELETE / UPDATE has a WHERE (Supabase pg-safeupdate, see 2026-10i).
-- ════════════════════════════════════════════════════════════════════════════


-- ── PART 1: table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.judge_schedule (
  school_id    UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  judge_number INT  NOT NULL CHECK (judge_number BETWEEN 1 AND 999),
  round_no     INT  NOT NULL CHECK (round_no BETWEEN 1 AND 60),
  project_id   TEXT NOT NULL,
  PRIMARY KEY (school_id, judge_number, round_no),
  UNIQUE (school_id, judge_number, project_id),
  FOREIGN KEY (project_id, school_id) REFERENCES public.projects(id, school_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS judge_schedule_project_idx ON public.judge_schedule (school_id, project_id);

ALTER TABLE public.judge_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "judge_schedule_select" ON public.judge_schedule;
DROP POLICY IF EXISTS "judge_schedule_insert" ON public.judge_schedule;
DROP POLICY IF EXISTS "judge_schedule_update" ON public.judge_schedule;
DROP POLICY IF EXISTS "judge_schedule_delete" ON public.judge_schedule;
-- Read open: a judge's tablet reads its own rounds before/without an admin session. No names.
CREATE POLICY "judge_schedule_select" ON public.judge_schedule FOR SELECT USING (true);
CREATE POLICY "judge_schedule_insert" ON public.judge_schedule FOR INSERT WITH CHECK (false);
CREATE POLICY "judge_schedule_update" ON public.judge_schedule FOR UPDATE USING (false);
CREATE POLICY "judge_schedule_delete" ON public.judge_schedule FOR DELETE USING (false);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'judge_schedule') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.judge_schedule;
  END IF;
END $$;


-- ── PART 2: a judge's projects follow the schedule while one exists ─────────
-- Same signature as 2026-10k, so register_judge() and _resync_judges() pick it up unchanged.
CREATE OR REPLACE FUNCTION public._judge_projects(p_school uuid, p_num int, p_dept_ids jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM judge_schedule s WHERE s.school_id = p_school) THEN
      (SELECT COALESCE(jsonb_agg(s.project_id ORDER BY s.round_no), '[]'::jsonb)
         FROM judge_schedule s WHERE s.school_id = p_school AND s.judge_number = p_num)
    ELSE
      (SELECT COALESCE(jsonb_agg(p.id ORDER BY d.ord, p.num), '[]'::jsonb)
         FROM projects p JOIN departments d ON d.id = p.department_id
        WHERE p.school_id = p_school
          AND p_dept_ids ? p.department_id::text
          AND (d.judges_per_project IS NULL
               OR EXISTS (SELECT 1 FROM project_judges pj
                           WHERE pj.school_id = p_school AND pj.project_id = p.id AND pj.judge_number = p_num)))
  END
$$;
REVOKE EXECUTE ON FUNCTION public._judge_projects(uuid, int, jsonb) FROM PUBLIC, anon, authenticated;


-- ── PART 3: set_judge_schedule() — replace the whole schedule ───────────────
-- p_slots   = [{"kind":"round","no":1,"start":"8:30","end":"8:37"}, {"kind":"break",...}, …]
-- p_entries = [{"number": 1, "round": 1, "project_id": "p_…"}, …]  — every visit
CREATE OR REPLACE FUNCTION public.set_judge_schedule(p_school_id uuid, p_slots jsonb, p_entries jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_max    int;
  v_bad    record;
  v_roster jsonb;
BEGIN
  IF NOT is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_entries) <> 'array' OR jsonb_array_length(p_entries) = 0 THEN
    RAISE EXCEPTION 'The schedule has no visits.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(COALESCE(p_slots, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'The schedule has no rounds.' USING ERRCODE = 'P0001';
  END IF;
  v_max := judge_max(p_school_id);

  DROP TABLE IF EXISTS pg_temp._js;
  CREATE TEMP TABLE _js (num int, rnd int, pid text) ON COMMIT DROP;
  INSERT INTO _js
  SELECT (e ->> 'number')::int, (e ->> 'round')::int, e ->> 'project_id'
    FROM jsonb_array_elements(p_entries) e;

  SELECT num INTO v_bad FROM _js WHERE num IS NULL OR num < 1 OR num > v_max ORDER BY num LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Judge % is outside 1–% (the maximum). Raise Maximum judges in Setup first.',
      COALESCE(v_bad.num::text, '?'), v_max USING ERRCODE = 'P0001';
  END IF;
  SELECT rnd INTO v_bad FROM _js WHERE rnd IS NULL OR rnd < 1 OR rnd > 60 LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'Round numbers must be 1–60.' USING ERRCODE = 'P0001'; END IF;
  SELECT pid INTO v_bad FROM _js s
   WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = s.pid AND p.school_id = p_school_id) LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'A visit names a project that is not in this school.' USING ERRCODE = 'P0001'; END IF;
  SELECT num, rnd INTO v_bad FROM _js GROUP BY num, rnd HAVING count(*) > 1 LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Judge % has two projects in round %.', v_bad.num, v_bad.rnd USING ERRCODE = 'P0001';
  END IF;
  SELECT s.num, p.num AS pnum INTO v_bad FROM _js s JOIN projects p ON p.id = s.pid AND p.school_id = p_school_id
   GROUP BY s.num, p.num HAVING count(*) > 1 LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Judge % visits project #% twice.', v_bad.num, v_bad.pnum USING ERRCODE = 'P0001';
  END IF;

  -- Never drop a visit that was already scored: the judge would lose the project from their
  -- list while the score kept counting. Same promise as panels ("scored work never moves").
  SELECT j.alias, p.num AS pnum INTO v_bad
    FROM scores sc
    JOIN judges j   ON j.id = sc.judge_id AND j.school_id = sc.school_id
    JOIN projects p ON p.id = sc.project_id AND p.school_id = sc.school_id
   WHERE sc.school_id = p_school_id AND j.alias ~ '^Judge[0-9]{1,3}$'
     AND NOT EXISTS (SELECT 1 FROM _js s WHERE s.num = substr(j.alias, 6)::int AND s.pid = sc.project_id)
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '% has already scored project #%, and this schedule takes that visit away. Keep that visit in the schedule.',
      v_bad.alias, v_bad.pnum USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM judge_schedule WHERE school_id = p_school_id;
  INSERT INTO judge_schedule (school_id, judge_number, round_no, project_id)
  SELECT p_school_id, num, rnd, pid FROM _js;

  INSERT INTO app_settings (school_id, key, value) VALUES (p_school_id, 'judging_schedule', p_slots::text)
  ON CONFLICT (school_id, key) DO UPDATE SET value = EXCLUDED.value;

  -- The grid follows the schedule: each number covers the departments of its projects, so the
  -- sign-in screen says "Judge 7 · 6-8 + 9-12". set_judge_roster() keeps its own guards (numbers
  -- ≤ the maximum, a signed-in judge never loses a department) and re-syncs every judge — whose
  -- list now comes from the schedule (PART 2).
  SELECT COALESCE(jsonb_agg(jsonb_build_object('number', num, 'department_ids', ids)), '[]'::jsonb) INTO v_roster
    FROM (SELECT s.num, jsonb_agg(DISTINCT p.department_id::text) AS ids
            FROM _js s JOIN projects p ON p.id = s.pid AND p.school_id = p_school_id
           WHERE p.department_id IS NOT NULL
           GROUP BY s.num) g;
  PERFORM set_judge_roster(p_school_id, v_roster);

  RETURN jsonb_build_object(
    'judges',   (SELECT count(DISTINCT num) FROM _js),
    'visits',   (SELECT count(*) FROM _js),
    'projects', (SELECT count(DISTINCT pid) FROM _js));
END $$;
GRANT EXECUTE ON FUNCTION public.set_judge_schedule(uuid, jsonb, jsonb) TO authenticated;


-- ── PART 4: clear_judge_schedule() ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.clear_judge_schedule(p_school_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM judge_schedule WHERE school_id = p_school_id;
  DELETE FROM app_settings WHERE school_id = p_school_id AND key = 'judging_schedule';
  -- Lists go back to the grid / panels. The grid itself is left as the schedule set it.
  PERFORM _resync_judges(p_school_id);
END $$;
GRANT EXECUTE ON FUNCTION public.clear_judge_schedule(uuid) TO authenticated;
