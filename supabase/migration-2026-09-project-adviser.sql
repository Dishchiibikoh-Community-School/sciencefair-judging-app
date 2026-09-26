-- ============================================================
-- Migration 2026-09 — adviser + group members on projects (v2)
--
-- WHY: adviser name and group members previously lived ONLY in
-- `registration_submissions`, the table the student self-registration form
-- writes to. When an admin creates a project directly (the 2026-27 workflow,
-- where organisers register the teams themselves) there is no submission row,
-- so those fields were impossible to enter and rendered blank everywhere —
-- including the printed project list PDF.
--
-- This moves the data onto the project, where it belongs. Student-registered
-- projects keep working: the app reads the project columns first and falls
-- back to `registration_submissions` for older rows.
--
-- SAFE TO RE-RUN: uses IF NOT EXISTS.
-- Apply in: Supabase dashboard → SQL Editor → run against the v2 project.
-- ============================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS advisor_name  TEXT  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS group_members JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN projects.advisor_name  IS 'Teacher/adviser for this project. Admin-editable in the Projects tab.';
COMMENT ON COLUMN projects.group_members IS 'JSON array of student names for group/team entries.';

-- Backfill from existing registration submissions so nothing is lost for
-- projects that were created through the student registration form.
UPDATE projects p
SET
  advisor_name  = COALESCE(NULLIF(p.advisor_name, ''), COALESCE(rs.advisor_name, '')),
  group_members = CASE
                    WHEN p.group_members IS NULL OR p.group_members = '[]'::jsonb
                      THEN COALESCE(rs.group_members, '[]'::jsonb)
                    ELSE p.group_members
                  END
FROM registration_submissions rs
WHERE rs.project_id = p.id
  AND rs.school_id  = p.school_id;

-- Verify:
--   SELECT num, title, advisor_name, group_members FROM projects ORDER BY num;
