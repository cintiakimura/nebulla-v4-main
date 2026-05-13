-- Full Postgres schema (Layer 2)
-- Run on Render DB:
--   psql "$DATABASE_URL" -f db/render-layer2-schema.sql
--
-- Source alignment:
-- - Master Plan Tab 4 (Pages + Navigation data model needs)
-- - Master Plan Tab 6 (Render workspace isolation + project/workspace IDs)
-- - JSONB for AI/flexible outputs
-- - Enums for controlled status/state

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- fuzzy search
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid, crypto helpers

CREATE SCHEMA IF NOT EXISTS app;

SET search_path TO app, public;

-- =========================================================
-- Enums
-- =========================================================
CREATE TYPE user_role AS ENUM ('owner', 'parent', 'teacher', 'therapist', 'caregiver', 'child', 'admin');
CREATE TYPE account_provider AS ENUM ('github', 'email', 'username');
CREATE TYPE project_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE workspace_status AS ENUM ('pending', 'ready', 'error');
CREATE TYPE secret_sync_status AS ENUM ('pending', 'synced', 'failed');
CREATE TYPE session_status AS ENUM ('active', 'revoked', 'expired');
CREATE TYPE module_kind AS ENUM ('aac_grid', 'visual_schedules', 'pecs_exchange', 'emotion_id', 'social_stories', 'sensory_breaks');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done', 'blocked', 'archived');
CREATE TYPE mastery_level AS ENUM ('not_started', 'emerging', 'developing', 'mastered');
CREATE TYPE artifact_type AS ENUM ('master_plan', 'mind_map', 'ui_prompt', 'ui_code', 'svg_preview', 'report', 'other');
CREATE TYPE llm_run_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');

-- =========================================================
-- Tenancy + identity
-- =========================================================
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  render_workspace_id TEXT NOT NULL UNIQUE,
  workspace_name TEXT NOT NULL,
  status workspace_status NOT NULL DEFAULT 'pending',
  owner_user_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider account_provider NOT NULL,
  provider_user_id TEXT NOT NULL,
  email TEXT,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  password_hash TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower
  ON users (LOWER(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_lower
  ON users (LOWER(username))
  WHERE username IS NOT NULL;

ALTER TABLE workspaces
  ADD CONSTRAINT fk_workspaces_owner_user
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  status project_status NOT NULL DEFAULT 'draft',
  pages JSONB NOT NULL DEFAULT '[]'::jsonb, -- tab 4 page map
  edges JSONB NOT NULL DEFAULT '[]'::jsonb, -- tab 4 graph links
  ui_manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_workspace_slug
  ON projects (workspace_id, slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_projects_name_trgm ON projects USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);

-- =========================================================
-- Auth/session/reset
-- =========================================================
CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  status session_status NOT NULL DEFAULT 'active',
  session_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_token_hash)
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

-- =========================================================
-- Master-plan + AI artifacts
-- =========================================================
CREATE TABLE IF NOT EXISTS master_plan_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tab_number INT NOT NULL CHECK (tab_number BETWEEN 1 AND 6),
  title TEXT NOT NULL,
  content_md TEXT NOT NULL DEFAULT '',
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, tab_number)
);

CREATE INDEX IF NOT EXISTS idx_master_plan_sections_project ON master_plan_sections(project_id);

CREATE TABLE IF NOT EXISTS ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trigger_source TEXT NOT NULL,          -- e.g., ANSWER_Q1, manual, cron
  model_name TEXT NOT NULL,              -- e.g., grok-4-1-fast-reasoning
  status llm_run_status NOT NULL DEFAULT 'queued',
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_project ON ai_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_runs_status ON ai_runs(status);

CREATE TABLE IF NOT EXISTS artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ai_run_id UUID REFERENCES ai_runs(id) ON DELETE SET NULL,
  type artifact_type NOT NULL,
  path TEXT,                             -- file path or object key
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_text TEXT,                     -- optional markdown/raw text
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id, type, created_at DESC);

-- =========================================================
-- Secrets + integration sync
-- =========================================================
CREATE TABLE IF NOT EXISTS project_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_name TEXT NOT NULL,
  value_ciphertext TEXT NOT NULL,        -- encrypted at app layer / KMS
  value_checksum TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'dashboard',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, key_name)
);

CREATE INDEX IF NOT EXISTS idx_project_secrets_project ON project_secrets(project_id);

CREATE TABLE IF NOT EXISTS secret_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status secret_sync_status NOT NULL DEFAULT 'pending',
  target_service_id TEXT,                -- Render service id
  diff_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_secret_sync_jobs_project ON secret_sync_jobs(project_id, created_at DESC);

-- =========================================================
-- Domain tables (Tab 4 modules/pages)
-- =========================================================
CREATE TABLE IF NOT EXISTS children_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  external_ref TEXT,
  first_name TEXT NOT NULL,
  birth_date DATE,
  primary_language TEXT,
  diagnosis_notes TEXT,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_children_profiles_project ON children_profiles(project_id);
CREATE INDEX IF NOT EXISTS idx_children_profiles_name_trgm ON children_profiles USING gin (first_name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS aac_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children_profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  category TEXT,
  symbol_url TEXT,
  tts_text TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_custom BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aac_items_project ON aac_items(project_id);

CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  schedule_date DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_items_schedule ON schedule_items(schedule_id, sort_order);

CREATE TABLE IF NOT EXISTS pecs_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children_profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  image_url TEXT,
  points INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emotion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children_profiles(id) ON DELETE CASCADE,
  emotion_label TEXT NOT NULL,
  confidence NUMERIC(5,2),
  source TEXT NOT NULL DEFAULT 'manual',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb, -- slides/pages/script/voice refs
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sensory_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children_profiles(id) ON DELETE CASCADE,
  module module_kind NOT NULL DEFAULT 'sensory_breaks',
  duration_seconds INT,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================
-- KPI tracking
-- =========================================================
CREATE TABLE IF NOT EXISTS kpi_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  module module_kind NOT NULL,
  feature_name TEXT NOT NULL,
  kpi_name TEXT NOT NULL,
  target_value NUMERIC,
  unit TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, module, feature_name, kpi_name)
);

CREATE TABLE IF NOT EXISTS kpi_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children_profiles(id) ON DELETE SET NULL,
  kpi_definition_id UUID NOT NULL REFERENCES kpi_definitions(id) ON DELETE CASCADE,
  measured_value NUMERIC NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_kpi_measurements_project_time ON kpi_measurements(project_id, measured_at DESC);

-- =========================================================
-- Generic tasks + notes
-- =========================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children_profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status task_status NOT NULL DEFAULT 'todo',
  priority INT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  assignee_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);

CREATE TABLE IF NOT EXISTS notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children_profiles(id) ON DELETE SET NULL,
  author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_project_created ON notes(project_id, created_at DESC);

-- =========================================================
-- Audit + event log
-- =========================================================
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_project_time ON audit_events(project_id, created_at DESC);

-- =========================================================
-- Trigger helpers
-- =========================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_workspaces_updated_at') THEN
    CREATE TRIGGER trg_workspaces_updated_at BEFORE UPDATE ON workspaces
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated_at') THEN
    CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_projects_updated_at') THEN
    CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_children_profiles_updated_at') THEN
    CREATE TRIGGER trg_children_profiles_updated_at BEFORE UPDATE ON children_profiles
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_aac_items_updated_at') THEN
    CREATE TRIGGER trg_aac_items_updated_at BEFORE UPDATE ON aac_items
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_schedules_updated_at') THEN
    CREATE TRIGGER trg_schedules_updated_at BEFORE UPDATE ON schedules
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_social_stories_updated_at') THEN
    CREATE TRIGGER trg_social_stories_updated_at BEFORE UPDATE ON social_stories
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_project_secrets_updated_at') THEN
    CREATE TRIGGER trg_project_secrets_updated_at BEFORE UPDATE ON project_secrets
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tasks_updated_at') THEN
    CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END
$$;

-- =========================================================
-- RLS baseline (owner/member isolation)
-- =========================================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE children_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_plan_sections ENABLE ROW LEVEL SECURITY;

-- These policies assume application sets:
--   SET app.current_user_id = '<uuid>';
-- If not set, no rows are returned.
CREATE POLICY projects_member_read ON projects
  FOR SELECT
  USING (
    owner_user_id::text = current_setting('app.current_user_id', true)
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = projects.id
        AND pm.user_id::text = current_setting('app.current_user_id', true)
    )
  );

CREATE POLICY projects_owner_write ON projects
  FOR ALL
  USING (owner_user_id::text = current_setting('app.current_user_id', true))
  WITH CHECK (owner_user_id::text = current_setting('app.current_user_id', true));

COMMIT;
