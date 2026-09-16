-- Drafts («Наброски»): the conversation with the editor and the card it
-- fills in, before a talk exists. Both JSONB like talks.slides — every
-- write replaces the whole value, and a draft is disposable. `job_id` is
-- set on hand-off and the draft is kept: the user may come back to it to
-- collect a second version. The job, not the talk — the talk exists only
-- once expansion completes, and the job row already carries its id.
CREATE TABLE IF NOT EXISTS drafts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT '',
  messages     JSONB NOT NULL DEFAULT '[]'::jsonb,
  card         JSONB NOT NULL DEFAULT '{}'::jsonb,
  job_id       UUID REFERENCES talk_jobs(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drafts_workspace_idx ON drafts (workspace_id, updated_at DESC);
