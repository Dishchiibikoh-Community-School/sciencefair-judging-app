-- ════════════════════════════════════════════════════════════════════════════
-- Migration 2026-10f — per-department scoring mode (+ Phase 3 columns)
-- ════════════════════════════════════════════════════════════════════════════
-- WHY
--   PreK and K-2 are not scored at the 2026-27 fair: judges leave a comment and a
--   commendation, every project is a winner, and nothing is ranked. That cannot be
--   expressed as a zero-point rubric — rubricMax() would be 0 and ranking, the
--   progress percentage and the consensus check all divide by it. It has to be a
--   property of the department.
--
--   `locked`, `finalized_at` and `award_grouping` belong to Phase 3 and nothing
--   reads them yet. They are included here so the organiser makes ONE trip to the
--   SQL editor instead of two (same reasoning as departments.code in 2026-10e).
--
-- SAFETY — ADDITIVE ONLY, and every default reproduces today's behaviour:
--   • scoring_mode defaults to 'scored'        → every existing department is unchanged.
--   • locked defaults to false, finalized_at to NULL, award_grouping to 'department'.
--   • scores.commendation defaults to ''.
--   Old app + new schema → the old build never selects these columns.
--   New app + old schema → loadDepartments() falls back to 'scored' for every
--     department and logs SCORING_MODE_COLS_MISSING; feedback mode simply cannot be
--     switched on until this runs. Nothing breaks.
--   Rollback = redeploy the previous build. Nothing is dropped or rewritten.
--
-- RE-RUNNABLE (ADD COLUMN IF NOT EXISTS / idempotent constraint creation).
--
-- Verify afterwards as anon:
--   curl "$URL/rest/v1/departments?select=name,scoring_mode&school_id=eq.<id>" -H "apikey: <anon>"
--     → 200, every row 'scored' (judges must be able to read it — it decides which
--       scoring form they are shown)
-- ════════════════════════════════════════════════════════════════════════════


-- ── PART 1: how a department is judged ──────────────────────────────────────
--   'scored'   → the rubric, totals, ranking, ties, awards (everything so far)
--   'feedback' → comment + commendation only; never ranked, never flagged as an
--                outlier, never part of a tie. Every project is a participant.
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS scoring_mode TEXT NOT NULL DEFAULT 'scored';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'departments_scoring_mode_chk'
  ) THEN
    ALTER TABLE public.departments
      ADD CONSTRAINT departments_scoring_mode_chk
      CHECK (scoring_mode IN ('scored', 'feedback'));
  END IF;
END $$;


-- ── PART 2: Phase 3 columns (reserved — nothing reads them yet) ─────────────
-- Per-department completion, so PreK winners can be announced while 9-12 is still
-- deliberating. Today `locked` and `results_finalized` are single school-wide
-- app_settings keys and finishing is all-or-nothing.
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;

-- Whether this department's awards are given per category or for the department as
-- a whole. Per department, because a department with 8 projects spread over 6
-- categories would be handing out uncontested 1st places.
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS award_grouping TEXT NOT NULL DEFAULT 'department';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'departments_award_grouping_chk'
  ) THEN
    ALTER TABLE public.departments
      ADD CONSTRAINT departments_award_grouping_chk
      CHECK (award_grouping IN ('category', 'department'));
  END IF;
END $$;


-- ── PART 3: the commendation a feedback-mode judge gives ────────────────────
-- Kept as its own column rather than squeezed into `criteria` (which is numeric,
-- keyed by rubric criterion id) so exports and the public page can read it plainly.
-- A scored department never writes it.
ALTER TABLE public.scores
  ADD COLUMN IF NOT EXISTS commendation TEXT NOT NULL DEFAULT '';
