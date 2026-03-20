-- ============================================================
-- Science Fair Judging App — Supabase Schema
-- Run this in the Supabase SQL editor for your project.
-- ============================================================

-- ── TABLES ──────────────────────────────────────────────────

-- Registered judges (anonymous aliases, no real identity stored)
CREATE TABLE judges (
  id         TEXT        PRIMARY KEY,          -- client-generated: "j_" + random
  alias      TEXT        NOT NULL,             -- e.g. "Bold Falcon"
  projects   JSONB       NOT NULL DEFAULT '[]', -- assigned project IDs
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One score row per judge+project pair
CREATE TABLE scores (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  judge_id     TEXT        NOT NULL REFERENCES judges(id) ON DELETE CASCADE,
  project_id   TEXT        NOT NULL,
  method       SMALLINT    NOT NULL DEFAULT 0 CHECK (method    BETWEEN 0 AND 20),
  research     SMALLINT    NOT NULL DEFAULT 0 CHECK (research  BETWEEN 0 AND 15),
  data         SMALLINT    NOT NULL DEFAULT 0 CHECK (data      BETWEEN 0 AND 20),
  results      SMALLINT    NOT NULL DEFAULT 0 CHECK (results   BETWEEN 0 AND 20),
  display      SMALLINT    NOT NULL DEFAULT 0 CHECK (display   BETWEEN 0 AND 15),
  creativity   SMALLINT    NOT NULL DEFAULT 0 CHECK (creativity BETWEEN 0 AND 10),
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
  title       TEXT        NOT NULL DEFAULT 'Science Fair 2025 — Final Results',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ                            -- NULL = active
);

-- Global app settings (key/value — used for persisting lock state etc.)
CREATE TABLE app_settings (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the locked setting
INSERT INTO app_settings (key, value) VALUES ('locked', 'false');


-- ── ROW LEVEL SECURITY ──────────────────────────────────────
-- NOTE: Full per-judge enforcement (judges can only write their OWN scores)
-- requires Supabase Auth with JWTs. The policies below are appropriate for
-- the current phase (invite-code auth, no Supabase Auth yet). When Supabase
-- Auth is added, replace the score INSERT/UPDATE policies with:
--   USING (auth.uid()::text = judge_id)

ALTER TABLE judges      ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores      ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

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


-- ── REALTIME ────────────────────────────────────────────────
-- Enable realtime publication for live dashboard updates.
-- Run these after enabling the Realtime extension in your Supabase project.

ALTER PUBLICATION supabase_realtime ADD TABLE judges;
ALTER PUBLICATION supabase_realtime ADD TABLE scores;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE it_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE share_links;
ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;


-- ── INDEXES ─────────────────────────────────────────────────
CREATE INDEX scores_judge_id_idx    ON scores (judge_id);
CREATE INDEX scores_project_id_idx  ON scores (project_id);
CREATE INDEX activity_log_time_idx  ON activity_log (created_at DESC);
CREATE INDEX it_logs_time_idx       ON it_logs (created_at DESC);
CREATE INDEX share_links_token_idx  ON share_links (token) WHERE revoked_at IS NULL;
