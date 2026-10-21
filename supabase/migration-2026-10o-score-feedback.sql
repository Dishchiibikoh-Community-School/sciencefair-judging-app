-- ════════════════════════════════════════════════════════════════════════════
-- Migration 2026-10o — structured judge feedback + safety concern on a score
-- ════════════════════════════════════════════════════════════════════════════
-- WHY
--   The 2026-27 ELEMENTARY evaluation form asks each judge for:
--     • Strength / What the student did well
--     • Next step / Suggestion for improvement
--     • Safety / rule concern?  ☐ No  ☐ Yes — notify the Science Fair Committee
--   The app had one free-text `notes` field. Folding three answers into it would make the
--   safety flag unsearchable (the admin's Alerts board must show it the moment it is ticked)
--   and the two comments impossible to print separately for students later.
--
-- WHAT
--   • scores.feedback        JSONB   NOT NULL DEFAULT '{}'   — {"strength": "…", "next_step": "…"}
--   • scores.safety_concern  BOOLEAN NOT NULL DEFAULT false
--   Nothing else. The existing scores policies are ROW policies (the judge must exist in this
--   school), so they cover the new columns as they are; scores is already in the realtime
--   publication, so a ticked concern reaches the admin's screen live.
--
-- COUPLING — none. ADDITIVE ONLY, either order:
--   • Old app + this SQL: the columns sit at their defaults; nothing reads them.
--   • New app without this SQL: upsertScore() sees PGRST204 (unknown column), retries without
--     the two columns and writes the comments + a "⚠ SAFETY / RULE CONCERN" line into `notes`
--     instead (IT log SCORE_FEEDBACK_COLS_MISSING). Nothing the judge wrote is lost, but the
--     Alerts board cannot show the concern until this is run. Run it before judging day.
--
-- RE-RUNNABLE. No DELETE / UPDATE at all (pg-safeupdate, see 2026-10i).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS feedback       JSONB   NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.scores ADD COLUMN IF NOT EXISTS safety_concern BOOLEAN NOT NULL DEFAULT false;

-- feedback must stay an object (the app reads .strength / .next_step from it).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scores_feedback_is_object') THEN
    ALTER TABLE public.scores ADD CONSTRAINT scores_feedback_is_object CHECK (jsonb_typeof(feedback) = 'object');
  END IF;
END $$;
