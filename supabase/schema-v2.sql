-- ============================================================
-- Science Fair Judging App v2 — Multi-Tenant Schema
-- Apply this to a NEW Supabase project (not the v1 project).
-- v1 at qritiko.com remains untouched on its own project.
-- ============================================================


-- ── EXTENSIONS ───────────────────────────────────────────────
-- gen_random_uuid() is available by default in Supabase (pgcrypto).


-- ── TABLES ───────────────────────────────────────────────────

-- One row per school account. Slug is the URL key (e.g. "dishchiibikoh").
CREATE TABLE schools (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  slug         TEXT        NOT NULL UNIQUE,        -- used in URL: /s/dishchiibikoh
  invite_code  TEXT        NOT NULL,               -- judges enter this to register
  admin_pin    TEXT        NOT NULL DEFAULT '0000', -- 4-digit PIN for IT/reset ops
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Links Supabase Auth users to schools with a role.
CREATE TABLE school_admins (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, user_id)
);

-- Per-school custom rubrics stored as a JSONB criteria array.
-- Each criterion: { id, label, desc, max, steps[] }
CREATE TABLE rubrics (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL DEFAULT 'Default Rubric',
  criteria   JSONB       NOT NULL DEFAULT '[]',
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Departments per school (Elementary / Middle School / High School — admin-configurable)
CREATE TABLE departments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  max_judges INT         NOT NULL DEFAULT 5,
  ord        INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, name)
);

-- Projects per school (admin can add/remove/lock)
CREATE TABLE projects (
  id            TEXT        NOT NULL,              -- e.g. "p1", "p_abc123"
  school_id     UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  num           TEXT        NOT NULL,
  title         TEXT        NOT NULL,
  cat           TEXT        NOT NULL DEFAULT '',
  grade         TEXT        NOT NULL DEFAULT '',
  locked        BOOLEAN     NOT NULL DEFAULT FALSE,
  department_id UUID        REFERENCES departments(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, school_id)
);

-- Registered judges per school (anonymous aliases)
CREATE TABLE judges (
  id            TEXT        NOT NULL,              -- client-generated: "j_" + random
  school_id     UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  alias         TEXT        NOT NULL,              -- e.g. "Judge1"
  projects      JSONB       NOT NULL DEFAULT '[]', -- assigned project IDs
  department_id UUID        REFERENCES departments(id) ON DELETE SET NULL,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, school_id),
  UNIQUE (school_id, department_id, alias)
);

-- One score row per judge+project pair.
-- Rubric criteria stored as JSONB to support custom rubrics.
-- { "presentation": 4, "data": 6, ... } — keys match rubric criterion ids.
CREATE TABLE scores (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  judge_id     TEXT        NOT NULL,
  project_id   TEXT        NOT NULL,
  criteria     JSONB       NOT NULL DEFAULT '{}',
  notes        TEXT        NOT NULL DEFAULT '',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (judge_id, project_id)
);

-- Human-readable activity log — NEVER deleted on reset (security audit trail)
CREATE TABLE activity_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  message    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Structured IT / diagnostic log — append-only, never deleted on reset
CREATE TABLE it_logs (
  id         TEXT        NOT NULL,                -- client-generated EVT-XXXXXX
  school_id  UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  level      TEXT        NOT NULL CHECK (level IN ('ERROR','WARN','INFO','DEBUG')),
  module     TEXT        NOT NULL,
  event      TEXT        NOT NULL,
  detail     TEXT        NOT NULL,
  payload    JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, school_id)
);

-- Public share links (soft-deleted via revoked_at)
CREATE TABLE share_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL UNIQUE,
  expiry      TEXT        NOT NULL DEFAULT 'never',
  show_rubric BOOLEAN     NOT NULL DEFAULT TRUE,
  title       TEXT        NOT NULL DEFAULT 'Science Fair Results',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

-- Per-school app settings (key/value).
-- Compound PK: (school_id, key) — multiple schools can have key="locked".
CREATE TABLE app_settings (
  school_id  UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  key        TEXT        NOT NULL,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (school_id, key)
);

-- Judge deliberation notes — one per judge+project pair
CREATE TABLE deliberation_notes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  judge_id       TEXT        NOT NULL,
  project_id     TEXT        NOT NULL,
  comment        TEXT        NOT NULL DEFAULT '',
  recommendation TEXT        NOT NULL DEFAULT 'Pending'
                             CHECK (recommendation IN ('Recommend for Award','Strong Contender','Good Work','Needs Improvement','Pending')),
  flagged        BOOLEAN     NOT NULL DEFAULT FALSE,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (judge_id, project_id)
);

-- Admin final award decisions — one per project per school
CREATE TABLE final_decisions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  project_id   TEXT        NOT NULL,
  award        TEXT        NOT NULL DEFAULT 'Pending'
                           CHECK (award IN ('1st Place','2nd Place','3rd Place','Honorable Mention','Best in Category','No Award','Pending')),
  admin_notes  TEXT        NOT NULL DEFAULT '',
  finalized    BOOLEAN     NOT NULL DEFAULT FALSE,
  finalized_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, project_id)
);

-- Admin-generated score snapshots
CREATE TABLE score_backups (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  label      TEXT        NOT NULL DEFAULT '',
  snapshot   JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Judge and admin validation entries — one row per judge (plus 'admin') per school
CREATE TABLE validations (
  school_id    UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  judge_id     TEXT        NOT NULL,               -- judge UUID or 'admin'
  approved     BOOLEAN     NOT NULL,
  comment      TEXT        NOT NULL DEFAULT '',
  validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (school_id, judge_id)
);

-- Admin-generated registration link tokens
CREATE TABLE registration_links (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  token      TEXT        NOT NULL UNIQUE,
  active     BOOLEAN     NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Student registration form submissions
CREATE TABLE registration_submissions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         UUID        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  project_id        TEXT,
  reg_number        TEXT        NOT NULL DEFAULT '',
  student_name      TEXT        NOT NULL DEFAULT '',
  project_title     TEXT        NOT NULL DEFAULT '',
  category          TEXT        NOT NULL DEFAULT '',
  division          TEXT        NOT NULL DEFAULT '',
  advisor_name      TEXT        NOT NULL DEFAULT '',
  group_members     TEXT        NOT NULL DEFAULT '',
  -- Additional registration form fields (25 total)
  school_name       TEXT        NOT NULL DEFAULT '',
  grade_level       TEXT        NOT NULL DEFAULT '',
  student_email     TEXT        NOT NULL DEFAULT '',
  student_phone     TEXT        NOT NULL DEFAULT '',
  parent_name       TEXT        NOT NULL DEFAULT '',
  parent_email      TEXT        NOT NULL DEFAULT '',
  parent_phone      TEXT        NOT NULL DEFAULT '',
  project_summary   TEXT        NOT NULL DEFAULT '',
  research_question TEXT        NOT NULL DEFAULT '',
  hypothesis        TEXT        NOT NULL DEFAULT '',
  methodology       TEXT        NOT NULL DEFAULT '',
  materials         TEXT        NOT NULL DEFAULT '',
  results           TEXT        NOT NULL DEFAULT '',
  conclusion        TEXT        NOT NULL DEFAULT '',
  project_references TEXT       NOT NULL DEFAULT '',
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── ROW LEVEL SECURITY ────────────────────────────────────────
-- Admin tables: auth.uid() must be in school_admins for that school_id.
-- Judge-writable tables: open anon (scoped at query level by school_id).
-- Public tables (schools, share_links): anon SELECT for slug/token lookup.
-- Phase 2 will add per-judge RLS using Supabase Anonymous Auth.

ALTER TABLE schools                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_admins           ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubrics                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects                ENABLE ROW LEVEL SECURITY;
ALTER TABLE judges                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE it_logs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_links             ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliberation_notes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_decisions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_backups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE validations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_submissions ENABLE ROW LEVEL SECURITY;

-- Helper: is the current auth user an admin of a given school?
CREATE OR REPLACE FUNCTION is_school_admin(sid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM school_admins
    WHERE school_id = sid AND user_id = auth.uid()
  );
$$;

-- schools: anon can SELECT (slug lookup for judges), INSERT (self-registration)
-- admin_pin is NOT in the public select columns — app never selects it for anon users
CREATE POLICY "schools_select" ON schools FOR SELECT USING (true);
CREATE POLICY "schools_insert" ON schools FOR INSERT WITH CHECK (true);
CREATE POLICY "schools_update" ON schools FOR UPDATE
  USING (is_school_admin(id));

-- school_admins: admin can read their own, INSERT for self-registration
CREATE POLICY "school_admins_select" ON school_admins FOR SELECT
  USING (user_id = auth.uid() OR is_school_admin(school_id));
CREATE POLICY "school_admins_insert" ON school_admins FOR INSERT WITH CHECK (true);
CREATE POLICY "school_admins_update" ON school_admins FOR UPDATE
  USING (is_school_admin(school_id));

-- rubrics: admin read/write, anon read (judges need criteria for scoring UI)
CREATE POLICY "rubrics_select" ON rubrics FOR SELECT USING (true);
CREATE POLICY "rubrics_insert" ON rubrics FOR INSERT WITH CHECK (is_school_admin(school_id));
CREATE POLICY "rubrics_update" ON rubrics FOR UPDATE USING (is_school_admin(school_id));
CREATE POLICY "rubrics_delete" ON rubrics FOR DELETE USING (is_school_admin(school_id));

-- departments: anon read (judges select dept at registration), admin write
CREATE POLICY "departments_select" ON departments FOR SELECT USING (true);
CREATE POLICY "departments_insert" ON departments FOR INSERT WITH CHECK (is_school_admin(school_id));
CREATE POLICY "departments_update" ON departments FOR UPDATE USING (is_school_admin(school_id));
CREATE POLICY "departments_delete" ON departments FOR DELETE USING (is_school_admin(school_id));

-- projects: anon read, admin write
CREATE POLICY "projects_select" ON projects FOR SELECT USING (true);
CREATE POLICY "projects_insert" ON projects FOR INSERT WITH CHECK (is_school_admin(school_id));
CREATE POLICY "projects_update" ON projects FOR UPDATE USING (is_school_admin(school_id));
CREATE POLICY "projects_delete" ON projects FOR DELETE USING (is_school_admin(school_id));

-- judges: anon read+insert (judge self-registration), admin delete (reset)
CREATE POLICY "judges_select" ON judges FOR SELECT USING (true);
CREATE POLICY "judges_insert" ON judges FOR INSERT WITH CHECK (true);
CREATE POLICY "judges_update" ON judges FOR UPDATE USING (true); -- needed for project assignment update
CREATE POLICY "judges_delete" ON judges FOR DELETE USING (is_school_admin(school_id));

-- scores: anon read+write (judges submit), admin delete (reset/project removal)
CREATE POLICY "scores_select" ON scores FOR SELECT USING (true);
CREATE POLICY "scores_insert" ON scores FOR INSERT WITH CHECK (true);
CREATE POLICY "scores_update" ON scores FOR UPDATE USING (true);
CREATE POLICY "scores_delete" ON scores FOR DELETE USING (is_school_admin(school_id));

-- activity_log: anon read+insert, no delete (security requirement)
CREATE POLICY "activity_log_select" ON activity_log FOR SELECT USING (true);
CREATE POLICY "activity_log_insert" ON activity_log FOR INSERT WITH CHECK (true);

-- it_logs: anon read+insert, no delete
CREATE POLICY "it_logs_select" ON it_logs FOR SELECT USING (true);
CREATE POLICY "it_logs_insert" ON it_logs FOR INSERT WITH CHECK (true);

-- share_links: anon read (public results page), admin write
CREATE POLICY "share_links_select" ON share_links FOR SELECT USING (true);
CREATE POLICY "share_links_insert" ON share_links FOR INSERT WITH CHECK (is_school_admin(school_id));
CREATE POLICY "share_links_update" ON share_links FOR UPDATE USING (is_school_admin(school_id));
CREATE POLICY "share_links_delete" ON share_links FOR DELETE USING (is_school_admin(school_id));

-- app_settings: anon read (judges need locked/deliberation_open), admin+anon write
-- (judges write their validation state — judges are anon users)
CREATE POLICY "app_settings_select" ON app_settings FOR SELECT USING (true);
CREATE POLICY "app_settings_insert" ON app_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "app_settings_update" ON app_settings FOR UPDATE USING (true);

-- deliberation_notes: anon read+write (judges submit during deliberation), admin delete
CREATE POLICY "delib_notes_select" ON deliberation_notes FOR SELECT USING (true);
CREATE POLICY "delib_notes_insert" ON deliberation_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "delib_notes_update" ON deliberation_notes FOR UPDATE USING (true);
CREATE POLICY "delib_notes_delete" ON deliberation_notes FOR DELETE USING (is_school_admin(school_id));

-- final_decisions: admin read+write, anon read (public results)
CREATE POLICY "final_decisions_select" ON final_decisions FOR SELECT USING (true);
CREATE POLICY "final_decisions_insert" ON final_decisions FOR INSERT WITH CHECK (is_school_admin(school_id));
CREATE POLICY "final_decisions_update" ON final_decisions FOR UPDATE USING (is_school_admin(school_id));
CREATE POLICY "final_decisions_delete" ON final_decisions FOR DELETE USING (is_school_admin(school_id));

-- score_backups: admin only
CREATE POLICY "score_backups_select" ON score_backups FOR SELECT USING (is_school_admin(school_id));
CREATE POLICY "score_backups_insert" ON score_backups FOR INSERT WITH CHECK (is_school_admin(school_id));
CREATE POLICY "score_backups_delete" ON score_backups FOR DELETE USING (is_school_admin(school_id));

-- validations: anon read+write (judges validate), admin delete (reset)
CREATE POLICY "validations_select" ON validations FOR SELECT USING (true);
CREATE POLICY "validations_insert" ON validations FOR INSERT WITH CHECK (true);
CREATE POLICY "validations_update" ON validations FOR UPDATE USING (true);
CREATE POLICY "validations_delete" ON validations FOR DELETE USING (is_school_admin(school_id));

-- registration_links: anon read (token validation), admin write
CREATE POLICY "reg_links_select" ON registration_links FOR SELECT USING (true);
CREATE POLICY "reg_links_insert" ON registration_links FOR INSERT WITH CHECK (is_school_admin(school_id));
CREATE POLICY "reg_links_update" ON registration_links FOR UPDATE USING (is_school_admin(school_id));

-- registration_submissions: anon insert (students submit), admin read/update/delete
CREATE POLICY "reg_sub_select" ON registration_submissions FOR SELECT USING (true);
CREATE POLICY "reg_sub_insert" ON registration_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "reg_sub_update" ON registration_submissions FOR UPDATE USING (true);
CREATE POLICY "reg_sub_delete" ON registration_submissions FOR DELETE USING (is_school_admin(school_id));


-- ── REALTIME ─────────────────────────────────────────────────
-- School-scoped channels filter by school_id server-side.
-- Run after enabling the Realtime extension in Supabase.

ALTER PUBLICATION supabase_realtime ADD TABLE departments;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
ALTER PUBLICATION supabase_realtime ADD TABLE judges;
ALTER PUBLICATION supabase_realtime ADD TABLE scores;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE it_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE share_links;
ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE deliberation_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE final_decisions;
ALTER PUBLICATION supabase_realtime ADD TABLE validations;
ALTER PUBLICATION supabase_realtime ADD TABLE score_backups;
ALTER PUBLICATION supabase_realtime ADD TABLE rubrics;


-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX schools_slug_idx          ON schools (slug);
CREATE INDEX school_admins_user_idx    ON school_admins (user_id);
CREATE INDEX school_admins_school_idx  ON school_admins (school_id);
CREATE INDEX rubrics_school_idx        ON rubrics (school_id) WHERE is_active = TRUE;
CREATE INDEX departments_school_idx    ON departments (school_id, ord);
CREATE INDEX projects_school_idx       ON projects (school_id);
CREATE INDEX projects_dept_idx         ON projects (department_id);
CREATE INDEX judges_school_idx         ON judges (school_id);
CREATE INDEX judges_dept_idx           ON judges (department_id);
CREATE INDEX scores_school_idx         ON scores (school_id);
CREATE INDEX scores_judge_id_idx       ON scores (judge_id);
CREATE INDEX scores_project_id_idx     ON scores (project_id);
CREATE INDEX activity_log_school_idx   ON activity_log (school_id, created_at DESC);
CREATE INDEX it_logs_school_idx        ON it_logs (school_id, created_at DESC);
CREATE INDEX share_links_token_idx     ON share_links (token) WHERE revoked_at IS NULL;
CREATE INDEX share_links_school_idx    ON share_links (school_id);
CREATE INDEX app_settings_school_idx   ON app_settings (school_id);
CREATE INDEX delib_notes_school_idx    ON deliberation_notes (school_id);
CREATE INDEX delib_notes_judge_idx     ON deliberation_notes (judge_id);
CREATE INDEX delib_notes_proj_idx      ON deliberation_notes (project_id);
CREATE INDEX final_dec_school_idx      ON final_decisions (school_id);
CREATE INDEX final_dec_proj_idx        ON final_decisions (project_id);
CREATE INDEX score_backups_school_idx  ON score_backups (school_id, created_at DESC);
CREATE INDEX validations_school_idx    ON validations (school_id);
CREATE INDEX reg_links_school_idx      ON registration_links (school_id);
CREATE INDEX reg_links_token_idx       ON registration_links (token);
CREATE INDEX reg_sub_school_idx        ON registration_submissions (school_id);
