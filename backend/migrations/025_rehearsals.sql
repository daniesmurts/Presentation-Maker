-- Rehearsals («Репетиция»): one row per run-through of a talk. Words and
-- times only — the browser did the recognising, no audio is ever stored.
-- JSONB like talks.slides: the row is a snapshot written once, plus the
-- review that a later model pass stores on it. Deleted with the talk.
CREATE TABLE IF NOT EXISTS rehearsals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id          UUID NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at       TIMESTAMPTZ NOT NULL,
  duration_ms      INTEGER NOT NULL,
  speech_available BOOLEAN NOT NULL DEFAULT TRUE,
  segments         JSONB NOT NULL DEFAULT '[]'::jsonb,
  visits           JSONB NOT NULL DEFAULT '[]'::jsonb,
  metrics          JSONB NOT NULL,
  review           JSONB,
  review_status    TEXT NOT NULL DEFAULT 'none' CHECK (review_status IN ('none', 'ready', 'failed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rehearsals_talk_idx ON rehearsals (talk_id, created_at DESC);
-- The free tier's «one review a month» counts reviews, not rehearsals.
CREATE INDEX IF NOT EXISTS rehearsals_reviews_month_idx ON rehearsals (workspace_id, created_at) WHERE review_status = 'ready';
