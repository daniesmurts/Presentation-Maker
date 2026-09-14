-- Workspaces and users (CLAUDE.md §7). One workspace per user at signup for
-- now; the table exists from day one so the pricing gate (§10: gate the
-- .pptx download and the talk count) is a WHERE on plan_tier, not a
-- migration later. brand_kit_id arrives with TODO E — expand/contract: add
-- the column then, not a placeholder now.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  -- 'free' | 'pro' — string, not enum, so a tier can be added without DDL.
  plan_tier   TEXT NOT NULL DEFAULT 'free',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  display_name   TEXT,
  -- UI language for this user; generation language is chosen per talk.
  locale         TEXT NOT NULL DEFAULT 'ru',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_workspace_idx ON users (workspace_id);
