-- One row per model call (CLAUDE.md §7 usage_log): cost, provider, tokens,
-- success, error_code. Every spend cap (TODO A.5) and every «is this feature
-- worth its bill» question is a query over this table, so it is written by
-- the provider adapters themselves, never by callers — a caller that forgets
-- is a cost nobody sees.

CREATE TABLE IF NOT EXISTS usage_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id)      ON DELETE SET NULL,
  workspace_id   UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  -- services/llm/types.ts Feature
  feature        TEXT    NOT NULL,
  -- 'presentation:outline' style sub-dimension, optional
  variant        TEXT,
  -- 'deepseek:deepseek-flash'
  model          TEXT    NOT NULL,
  -- which provider account served the call ('primary', 'key-2', …)
  account        TEXT,
  input_tokens   INTEGER NOT NULL,
  output_tokens  INTEGER NOT NULL,
  cost_usd       NUMERIC(10,6),
  duration_ms    INTEGER,
  success        BOOLEAN NOT NULL DEFAULT TRUE,
  -- 'TRUNCATED' | 'HTTP_429' | … — see services/llm/deepseek.ts
  error_code     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS usage_log_workspace_idx ON usage_log (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_log_feature_idx   ON usage_log (feature,      created_at DESC);
CREATE INDEX IF NOT EXISTS usage_log_created_idx   ON usage_log (created_at DESC);
