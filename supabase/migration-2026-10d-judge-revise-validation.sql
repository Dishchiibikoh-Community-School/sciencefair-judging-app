-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 2026-10d — let a judge revise (withdraw) their own validation
--
-- Run AFTER 2026-10c. NOT coupled: the app works before and after; this makes the
-- "Revise my validation" button actually take effect.
-- Re-runnable.
--
-- BUG: validations_delete was USING (is_school_admin(school_id)). Judges are anonymous,
-- so their DELETE matched zero rows — Postgres reports that as success, not an error.
-- The button cleared the validation on screen only; after a reload the judge was still
-- "validated" and locked out of re-scoring (AdminInstructions/JudgeInstructions promise
-- revising is possible until results are finalized).
--
-- FIX: a judge-side DELETE with the same identity check as the judge INSERT/UPDATE
-- policies (the judge must exist in that school), never for the admin's row, and only
-- while results are not finalized. Admins keep full delete (reset).
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "validations_delete" ON public.validations;
CREATE POLICY "validations_delete" ON public.validations FOR DELETE USING (
  is_school_admin(school_id)
  OR (
    validations.judge_id <> 'admin'
    AND EXISTS (SELECT 1 FROM judges j WHERE j.id = validations.judge_id AND j.school_id = validations.school_id)
    AND NOT EXISTS (SELECT 1 FROM app_settings s
                    WHERE s.school_id = validations.school_id AND s.key = 'results_finalized' AND s.value = 'true')
  )
);
