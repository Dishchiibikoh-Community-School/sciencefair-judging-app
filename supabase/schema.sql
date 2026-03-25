-- ============================================================
-- Science Fair Judging App — Supabase Schema
-- Run this in the Supabase SQL editor for your project.
-- ============================================================

-- -- TABLES ----------------------------------------------------------

-- Projects (dynamic — admin can add/remove/lock)
CREATE TABLE projects (
  id         TEXT        PRIMARY KEY,             -- e.g. "p1", "p_abc123"
  num        TEXT        NOT NULL,                -- display number e.g. "001"
  title      TEXT        NOT NULL,
  cat        TEXT        NOT NULL DEFAULT '',      -- category
  grade      TEXT        NOT NULL DEFAULT '',
  locked     BOOLEAN     NOT NULL DEFAULT FALSE,   -- locked projects cannot be edited or removed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registered judges (anonymous aliases, no real identity stored)
CREATE TABLE judges (
  id         TEXT        PRIMARY KEY,          -- client-generated: "j_" + random
  alias      TEXT        NOT NULL,             -- e.g. "Bold Falcon"
  projects   JSONB       NOT NULL DEFAULT '[]', -- assigned project IDs
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One score row per judge+project pair (10-criteria rubric, 42 pts max)
CREATE TABLE scores (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_id     TEXT        NOT NULL REFERENCES judges(id) ON DELETE CASCADE,
  project_id   TEXT        NOT NULL,
  presentation SMALLINT    NOT NULL DEFAULT 0 CHECK (presentation IN (0,2,4,6)),
  testable_q   SMALLINT    NOT NULL DEFAULT 0 CHECK (testable_q   IN (0,1,2,3)),
  background   SMALLINT    NOT NULL DEFAULT 0 CHECK (background   IN (0,1,2,3)),
  hypothesis   SMALLINT    NOT NULL DEFAULT 0 CHECK (hypothesis   IN (0,1,2,3)),
  variables    SMALLINT    NOT NULL DEFAULT 0 CHECK (variables    IN (0,1,2,3)),
  materials    SMALLINT    NOT NULL DEFAULT 0 CHECK (materials    IN (0,1,2,3)),
  data         SMALLINT    NOT NULL DEFAULT 0 CHECK (data         IN (0,2,4,6)),
  analysis     SMALLINT    NOT NULL DEFAULT 0 CHECK (analysis     IN (0,2,4,6)),
  conclusion   SMALLINT    NOT NULL DEFAULT 0 CHECK (conclusion   IN (0,1,2,3)),
  abstract     SMALLINT    NOT NULL DEFAULT 0 CHECK (abstract     IN (0,2,4,6)),
  notes        TEXT        NOT NULL DEFAULT '',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (judge_id, project_id)
);

-- Human-readable activity log — NEVER deleted on reset (security audit trail)
CREATE TABLE activity_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Structured IT / diagnostic log
CREATE TABLE it_logs (
  id         TEXT        PRIMARY KEY,          -- client-generated EVT-XXXXXX
  level      TEXT        NOT NULL CHECK (level IN ('ERROR','WARN','INFO','DEBUG')),
  module     TEXT        NOT NULL,
  event      TEXT        NOT NULL,
  detail     TEXT        NOT NULL,
  payload    JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Public share links (soft-deleted via revoked_at)
CREATE TABLE share_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT        NOT NULL UNIQUE,
  expiry      TEXT        NOT NULL DEFAULT 'never',  -- '1h' | '24h' | '7d' | 'never'
  show_rubric BOOLEAN     NOT NULL DEFAULT TRUE,
  title       TEXT        NOT NULL DEFAULT 'Science Fair SY 2025-2026 - Final Results',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ                            -- NULL = active
);

-- Global app settings (key/value — used for persisting lock state etc.)
CREATE TABLE app_settings (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Judge deliberation notes — one per judge+project pair
CREATE TABLE deliberation_notes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_id       TEXT        NOT NULL REFERENCES judges(id) ON DELETE CASCADE,
  project_id     TEXT        NOT NULL,
  comment        TEXT        NOT NULL DEFAULT '',
  recommendation TEXT        NOT NULL DEFAULT 'Pending'
                             CHECK (recommendation IN ('Recommend for Award','Strong Contender','Good Work','Needs Improvement','Pending')),
  flagged        BOOLEAN     NOT NULL DEFAULT FALSE,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (judge_id, project_id)
);

-- Admin final award decisions — one per project
CREATE TABLE final_decisions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   TEXT        NOT NULL UNIQUE,
  award        TEXT        NOT NULL DEFAULT 'Pending'
                           CHECK (award IN ('1st Place','2nd Place','3rd Place','Honorable Mention','Best in Category','No Award','Pending')),
  admin_notes  TEXT        NOT NULL DEFAULT '',
  finalized    BOOLEAN     NOT NULL DEFAULT FALSE,
  finalized_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the locked setting
INSERT INTO app_settings (key, value) VALUES ('locked', 'false');

-- Seed the deliberation_open setting
INSERT INTO app_settings (key, value) VALUES ('deliberation_open', 'false');

-- Seed the max_judges setting
INSERT INTO app_settings (key, value) VALUES ('max_judges', '15');


-- -- ROW LEVEL SECURITY -----------------------------------------------
-- NOTE: Full per-judge enforcement (judges can only write their OWN scores)
-- requires Supabase Auth with JWTs. The policies below are appropriate for
-- the current phase (invite-code auth, no Supabase Auth yet). When Supabase
-- Auth is added, replace the score INSERT/UPDATE policies with:
--   USING (auth.uid()::text = judge_id)

ALTER TABLE projects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE judges      ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliberation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_decisions    ENABLE ROW LEVEL SECURITY;

-- projects: public read, anon can manage (admin-only in practice)
CREATE POLICY "projects_select" ON projects FOR SELECT USING (true);
CREATE POLICY "projects_insert" ON projects FOR INSERT WITH CHECK (true);
CREATE POLICY "projects_update" ON projects FOR UPDATE USING (true);
CREATE POLICY "projects_delete" ON projects FOR DELETE USING (true);

-- judges: public read, anon can register (insert), no client-side updates
CREATE POLICY "judges_select" ON judges FOR SELECT USING (true);
CREATE POLICY "judges_insert" ON judges FOR INSERT WITH CHECK (true);
CREATE POLICY "judges_delete" ON judges FOR DELETE USING (true); -- reset only

-- scores: public read (for results), anon can submit/update, delete for reset
CREATE POLICY "scores_select" ON scores FOR SELECT USING (true);
CREATE POLICY "scores_insert" ON scores FOR INSERT WITH CHECK (true);
CREATE POLICY "scores_update" ON scores FOR UPDATE USING (true);
CREATE POLICY "scores_delete" ON scores FOR DELETE USING (true); -- reset only

-- activity_log: public read, anon can append — DELETE intentionally blocked
-- (the log is never cleared; this is a security requirement, not an oversight)
CREATE POLICY "activity_log_select" ON activity_log FOR SELECT USING (true);
CREATE POLICY "activity_log_insert" ON activity_log FOR INSERT WITH CHECK (true);

-- it_logs: public read, anon can append — no delete policy (same as activity_log)
CREATE POLICY "it_logs_select" ON it_logs FOR SELECT USING (true);
CREATE POLICY "it_logs_insert" ON it_logs FOR INSERT WITH CHECK (true);

-- share_links: public read (to check if a token is live), anon can manage
CREATE POLICY "share_links_select" ON share_links FOR SELECT USING (true);
CREATE POLICY "share_links_insert" ON share_links FOR INSERT WITH CHECK (true);
CREATE POLICY "share_links_update" ON share_links FOR UPDATE USING (true);
CREATE POLICY "share_links_delete" ON share_links FOR DELETE USING (true); -- reset only

-- app_settings: public read, anon can update (lock/unlock)
CREATE POLICY "app_settings_select" ON app_settings FOR SELECT USING (true);
CREATE POLICY "app_settings_update" ON app_settings FOR UPDATE USING (true);
CREATE POLICY "app_settings_insert" ON app_settings FOR INSERT WITH CHECK (true);

-- deliberation_notes: public read, anon can submit/update, delete for reset
CREATE POLICY "delib_notes_select" ON deliberation_notes FOR SELECT USING (true);
CREATE POLICY "delib_notes_insert" ON deliberation_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "delib_notes_update" ON deliberation_notes FOR UPDATE USING (true);
CREATE POLICY "delib_notes_delete" ON deliberation_notes FOR DELETE USING (true);

-- final_decisions: public read, anon can submit/update, delete for reset
CREATE POLICY "final_decisions_select" ON final_decisions FOR SELECT USING (true);
CREATE POLICY "final_decisions_insert" ON final_decisions FOR INSERT WITH CHECK (true);
CREATE POLICY "final_decisions_update" ON final_decisions FOR UPDATE USING (true);
CREATE POLICY "final_decisions_delete" ON final_decisions FOR DELETE USING (true);


-- -- REALTIME ----------------------------------------------------------
-- Enable realtime publication for live dashboard updates.
-- Run these after enabling the Realtime extension in your Supabase project.

ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE judges;
ALTER PUBLICATION supabase_realtime ADD TABLE scores;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE it_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE share_links;
ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE deliberation_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE final_decisions;


-- -- INDEXES -----------------------------------------------------------
CREATE INDEX scores_judge_id_idx    ON scores (judge_id);
CREATE INDEX scores_project_id_idx  ON scores (project_id);
CREATE INDEX activity_log_time_idx  ON activity_log (created_at DESC);
CREATE INDEX it_logs_time_idx       ON it_logs (created_at DESC);
CREATE INDEX share_links_token_idx  ON share_links (token) WHERE revoked_at IS NULL;
CREATE INDEX delib_notes_judge_idx  ON deliberation_notes (judge_id);
CREATE INDEX delib_notes_proj_idx   ON deliberation_notes (project_id);
CREATE INDEX final_dec_proj_idx     ON final_decisions (project_id);


-- -- MIGRATION: old rubric → new rubric (run once on live DB) --------
-- If you already applied the original schema, run this block to migrate
-- the scores table from the old 6-column rubric to the new 10-column rubric.
--
-- ALTER TABLE scores
--   DROP COLUMN IF EXISTS method,
--   DROP COLUMN IF EXISTS research,
--   DROP COLUMN IF EXISTS results,
--   DROP COLUMN IF EXISTS display,
--   DROP COLUMN IF EXISTS creativity,
--   ADD COLUMN presentation SMALLINT NOT NULL DEFAULT 0 CHECK (presentation IN (0,2,4,6)),
--   ADD COLUMN testable_q   SMALLINT NOT NULL DEFAULT 0 CHECK (testable_q   IN (0,1,2,3)),
--   ADD COLUMN background   SMALLINT NOT NULL DEFAULT 0 CHECK (background   IN (0,1,2,3)),
--   ADD COLUMN hypothesis   SMALLINT NOT NULL DEFAULT 0 CHECK (hypothesis   IN (0,1,2,3)),
--   ADD COLUMN variables    SMALLINT NOT NULL DEFAULT 0 CHECK (variables    IN (0,1,2,3)),
--   ADD COLUMN materials    SMALLINT NOT NULL DEFAULT 0 CHECK (materials    IN (0,1,2,3)),
--   ADD COLUMN analysis     SMALLINT NOT NULL DEFAULT 0 CHECK (analysis     IN (0,2,4,6)),
--   ADD COLUMN conclusion   SMALLINT NOT NULL DEFAULT 0 CHECK (conclusion   IN (0,1,2,3)),
--   ADD COLUMN abstract     SMALLINT NOT NULL DEFAULT 0 CHECK (abstract     IN (0,2,4,6));
-- NOTE: 'data' column already exists — only its CHECK constraint changed.
-- If you want to enforce the new constraint, drop and re-add the column or
-- use ALTER TABLE scores ALTER COLUMN data TYPE SMALLINT (and add CHECK separately).
