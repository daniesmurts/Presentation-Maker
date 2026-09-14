-- Talks («выступление») and their generation jobs (CLAUDE.md §7).
--
-- `slides` stays JSONB on the talk row: edits are "replace the array", and
-- slides have no ids — a selection is indices (lib/slideSelection.ts remaps
-- them through move/delete/insert). Don't normalise into rows without a
-- reason. `sources` is idx-numbered and slide text carries [N] markers, so
-- never renumber sources without rewriting slides.

CREATE TABLE IF NOT EXISTS talks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- project_id arrives with projects (TODO E); expand/contract, not a stub.
  title               TEXT NOT NULL,
  -- The user's talking points as given. Sanitised on the way INTO a prompt
  -- (lib/promptSanitiser.ts), stored verbatim here.
  brief               TEXT NOT NULL,
  -- shared/types.ts Intent / Audience — strings so the union can grow.
  intent              TEXT NOT NULL,
  audience            TEXT NOT NULL,
  language            TEXT NOT NULL DEFAULT 'ru',
  slide_count_target  INTEGER,
  duration_minutes    INTEGER,
  notes_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  -- «Только по моим материалам» — generation may not add facts.
  strict_to_brief     BOOLEAN NOT NULL DEFAULT FALSE,
  theme_id            TEXT NOT NULL DEFAULT 'default',
  slides              JSONB,
  sources             JSONB,
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS talks_workspace_idx ON talks (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS talks_owner_idx     ON talks (owner_id,     created_at DESC);

-- Pollable job row. Generation outlives HTTP timeouts, so the client polls
-- this; retries only surface a terminal failure on the LAST attempt — the UI
-- must never flash «failed» before a silent retry succeeds.
--
-- status: pending → processing → outline_ready (the approval gate; the job
-- waits for the user to confirm or edit the plan) → processing → ready |
-- failed. error_message is USER-FACING copy (lib/userFacingFailure.ts) —
-- the UI prints it verbatim, so no raw exception text ever lands here
-- (CLAUDE.md §3.2). Raw text goes to logs.
CREATE TABLE IF NOT EXISTS talk_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id        UUID REFERENCES talks(id) ON DELETE CASCADE,
  workspace_id   UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending',
  -- The request, as submitted, so the worker is self-contained.
  request        JSONB NOT NULL,
  -- shared/types.ts OutlineSlide[] once the outline pass has run; replaced
  -- by the user's edited version at approval.
  outline        JSONB,
  error_message  TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS talk_jobs_user_idx ON talk_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS talk_jobs_talk_idx ON talk_jobs (talk_id);
