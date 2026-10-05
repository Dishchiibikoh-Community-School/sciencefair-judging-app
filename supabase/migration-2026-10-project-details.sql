-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 2026-10 — project details captured from the student participation form
--
-- Adds three free-text columns to `projects` (public: judges see room + description):
--   room         — classroom / room number written on the form (e.g. "T25")
--   description  — "What do you plan to investigate, test, design, or build?"
--   motivation   — "Why did you choose this project?"
--
-- Student names + grades are NOT here: migration-2026-10b moves them to the admin-only
-- project_private table as [{"name":"..","grade":".."}]. Run 2026-10b right after this.
--
-- NOT coupled to the app build: writeProjectRow() detects missing columns and retries
-- without them (logging PROJECT_DETAIL_COLS_MISSING) — but the fields are then not saved.
--
-- Re-runnable (also after 2026-10b): every statement is IF NOT EXISTS / idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS room        TEXT NOT NULL DEFAULT '';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS motivation  TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.projects.room        IS 'Room number from the participation form';
COMMENT ON COLUMN public.projects.description IS 'What the students plan to investigate, test, design or build';
COMMENT ON COLUMN public.projects.motivation  IS 'Why the students chose this project';

-- Verify (should list the three columns):
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'projects'
--    AND column_name IN ('room','description','motivation');
