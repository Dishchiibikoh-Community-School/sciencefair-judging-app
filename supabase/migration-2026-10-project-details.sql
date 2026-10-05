-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 2026-10 — project details captured from the student participation form
--
-- Adds three free-text columns to `projects`:
--   room         — classroom / room number written on the form (e.g. "T25")
--   description  — "What do you plan to investigate, test, design, or build?"
--   motivation   — "Why did you choose this project?"
--
-- Also documents the new SHAPE of projects.group_members (no type change — it is
-- already JSONB from migration-2026-09-project-adviser.sql):
--   2026-09:  ["Juan", "Maria"]                                  (array of names)
--   2026-10:  [{"name":"Juan","grade":"8"}, {"name":"Maria","grade":"7"}]
-- The app reads BOTH shapes (normMembers() in ScienceFairJudging.jsx), so existing
-- rows do not need to be rewritten. New writes use the object shape.
--
-- NOT coupled to the app build: writeProjectRow() detects missing columns and retries
-- without them (logging PROJECT_DETAIL_COLS_MISSING). Run it before using form scanning
-- or the new fields will silently not be saved.
--
-- Re-runnable: every statement is IF NOT EXISTS / idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS room        TEXT NOT NULL DEFAULT '';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS motivation  TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.projects.room        IS 'Room number from the participation form';
COMMENT ON COLUMN public.projects.description IS 'What the students plan to investigate, test, design or build';
COMMENT ON COLUMN public.projects.motivation  IS 'Why the students chose this project';
COMMENT ON COLUMN public.projects.group_members IS
  'JSONB array. 2026-10+: [{"name":"..","grade":".."}]. Legacy rows may hold plain strings.';

-- Verify (should list the three columns):
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'projects'
--    AND column_name IN ('room','description','motivation');
