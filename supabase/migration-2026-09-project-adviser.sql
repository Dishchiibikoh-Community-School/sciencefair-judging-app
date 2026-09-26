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
-- NOTE ON TYPES: projects.group_members is JSONB (a real array), while the older
-- registration_submissions.group_members is TEXT holding a comma/newline
-- separated list. The backfill below converts that text into a JSON array. The
-- registration table's own column is deliberately left as TEXT so this migration
-- cannot disturb existing submissions.
--
-- SAFE TO RE-RUN: ADD COLUMN uses IF NOT EXISTS, and the backfill never
-- overwrites a project that already has values.
-- Apply in: Supabase dashboard → SQL Editor → run against the v2 project
--           (ref evrupqnhgrfltfhafeyj / "sciencefair-v2"). NOT against v1.
-- ============================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS advisor_name  TEXT  NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS group_members JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN projects.advisor_name  IS 'Teacher/adviser for this project. Admin-editable in the Projects tab.';
COMMENT ON COLUMN projects.group_members IS 'JSON array of student names for group/team entries.';

-- Backfill from existing registration submissions so nothing is lost for
-- projects that were created through the student registration form.
-- Only fills blanks — a project that already carries values is left alone.
UPDATE projects p
SET
  advisor_name = COALESCE(NULLIF(p.advisor_name, ''), COALESCE(rs.advisor_name, '')),
  group_members = CASE
    -- already populated on the project → keep it
    WHEN p.group_members IS NOT NULL AND p.group_members <> '[]'::jsonb
      THEN p.group_members
    -- nothing to copy
    WHEN rs.group_members IS NULL OR btrim(rs.group_members) = ''
      THEN '[]'::jsonb
    -- legacy row that already holds a JSON array as text
    WHEN btrim(rs.group_members) LIKE '[%]'
      THEN btrim(rs.group_members)::jsonb
    -- normal case: comma- or newline-separated names → JSON array
    ELSE COALESCE((
      SELECT jsonb_agg(btrim(x))
      FROM regexp_split_to_table(rs.group_members, '[,' || chr(10) || ']') AS x
      WHERE btrim(x) <> ''
    ), '[]'::jsonb)
  END
FROM registration_submissions rs
WHERE rs.project_id = p.id
  AND rs.school_id  = p.school_id;

-- Verify:
--   SELECT num, title, advisor_name, group_members FROM projects ORDER BY num;
