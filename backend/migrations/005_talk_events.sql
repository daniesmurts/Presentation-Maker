-- Usage evidence (CLAUDE.md §3.9). An export event carries { slides, of } —
-- a 2-slide export is not the same evidence a talk was used as a 40-slide
-- one, and any composite "did this artefact get used" metric is built on
-- these rows. Record the shape of the event, not just that one happened.

CREATE TABLE IF NOT EXISTS talk_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id       UUID REFERENCES talks(id) ON DELETE SET NULL,
  workspace_id  UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  -- 'exported' | 'approved' | 'shared' | …
  event         TEXT NOT NULL,
  -- 'pptx' | 'pdf' — for exports
  format        TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS talk_events_talk_idx      ON talk_events (talk_id, created_at DESC);
CREATE INDEX IF NOT EXISTS talk_events_workspace_idx ON talk_events (workspace_id, created_at DESC);
