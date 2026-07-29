-- Nebulla platform schema for Cloudflare D1 (SQLite).
-- Applied by lib/nebulaPlatformD1.ts / npm run migrate:platform-d1
-- Behavioral parity with renderStack ensureTables (Postgres), D4=A empty start.

CREATE TABLE IF NOT EXISTS nebula_users (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  password_hash TEXT,
  billing_tier TEXT NOT NULL DEFAULT 'free',
  grok_api_key_encrypted TEXT,
  grok_key_validated_at TEXT,
  anthropic_api_key_encrypted TEXT,
  anthropic_key_validated_at TEXT,
  openai_api_key_encrypted TEXT,
  openai_key_validated_at TEXT,
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS nebula_projects (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES nebula_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pages TEXT NOT NULL DEFAULT '[]',
  edges TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT DEFAULT (datetime('now')),
  workspace_id TEXT,
  d1_database_id TEXT,
  d1_database_name TEXT,
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_nebula_projects_user ON nebula_projects(user_id);

CREATE TABLE IF NOT EXISTS nebula_client_workspaces (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES nebula_users(id) ON DELETE CASCADE,
  email TEXT,
  workspace_id TEXT NOT NULL UNIQUE,
  workspace_name TEXT NOT NULL,
  render_payload TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_nebula_client_workspaces_email_lower
  ON nebula_client_workspaces (email COLLATE NOCASE)
  WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS nebula_password_resets (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES nebula_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_nebula_pw_reset_token ON nebula_password_resets(token_hash);
CREATE INDEX IF NOT EXISTS idx_nebula_pw_reset_expires ON nebula_password_resets(expires_at);

CREATE TABLE IF NOT EXISTS nebula_token_usage_monthly (
  user_id TEXT NOT NULL REFERENCES nebula_users(id) ON DELETE CASCADE,
  month_year TEXT NOT NULL,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  grok3_tokens INTEGER NOT NULL DEFAULT 0,
  grok4_tokens INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, month_year)
);

CREATE INDEX IF NOT EXISTS idx_nebula_token_usage_month ON nebula_token_usage_monthly (month_year);
