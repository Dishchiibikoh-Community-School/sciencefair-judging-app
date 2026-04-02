-- ============================================================
-- Registration Feature Migration
-- Run this in the Supabase SQL editor to add registration tables.
-- ============================================================

-- Registration links (admin generates, participants open)
CREATE TABLE registration_links (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token      TEXT        NOT NULL UNIQUE,
  active     BOOLEAN     NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full registration form submissions (one per student/project)
CREATE TABLE registration_submissions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        TEXT        REFERENCES projects(id) ON DELETE SET NULL,
  reg_number        TEXT        NOT NULL UNIQUE,

  -- Student info
  student_name      TEXT        NOT NULL DEFAULT '',
  grade_level       TEXT        NOT NULL DEFAULT '',
  division          TEXT        NOT NULL DEFAULT '',
  school_name       TEXT        NOT NULL DEFAULT '',
  student_email     TEXT        NOT NULL DEFAULT '',
  contact_number    TEXT        NOT NULL DEFAULT '',

  -- Project info
  project_title     TEXT        NOT NULL DEFAULT '',
  category          TEXT        NOT NULL DEFAULT '',
  project_type      TEXT        NOT NULL DEFAULT 'Individual',
  group_members     JSONB       NOT NULL DEFAULT '[]',

  -- Teacher/Advisor
  advisor_name      TEXT        NOT NULL DEFAULT '',
  advisor_email     TEXT        NOT NULL DEFAULT '',
  school_department TEXT        NOT NULL DEFAULT '',

  -- Project details
  description       TEXT        NOT NULL DEFAULT '',
  research_question TEXT        NOT NULL DEFAULT '',
  hypothesis        TEXT        NOT NULL DEFAULT '',

  -- Logistics
  needs_electricity BOOLEAN     NOT NULL DEFAULT FALSE,
  special_equipment TEXT        NOT NULL DEFAULT '',
  has_trifold       BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Consent
  is_original_work  BOOLEAN     NOT NULL DEFAULT FALSE,
  agrees_to_rules   BOOLEAN     NOT NULL DEFAULT FALSE,
  guardian_name     TEXT        NOT NULL DEFAULT '',
  guardian_signature TEXT       NOT NULL DEFAULT '',

  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE registration_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_submissions ENABLE ROW LEVEL SECURITY;

-- registration_links: public read (validate token), admin write
CREATE POLICY "reg_links_select" ON registration_links FOR SELECT USING (true);
CREATE POLICY "reg_links_insert" ON registration_links FOR INSERT WITH CHECK (true);
CREATE POLICY "reg_links_update" ON registration_links FOR UPDATE USING (true);
CREATE POLICY "reg_links_delete" ON registration_links FOR DELETE USING (true);

-- registration_submissions: public insert (form submission), full admin read/delete
CREATE POLICY "reg_subs_select" ON registration_submissions FOR SELECT USING (true);
CREATE POLICY "reg_subs_insert" ON registration_submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "reg_subs_delete" ON registration_submissions FOR DELETE USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE registration_links;
ALTER PUBLICATION supabase_realtime ADD TABLE registration_submissions;

-- Indexes
CREATE INDEX reg_links_token_idx    ON registration_links (token) WHERE active = true;
CREATE INDEX reg_subs_div_cat_idx   ON registration_submissions (division, category);
CREATE INDEX reg_subs_project_idx   ON registration_submissions (project_id);
