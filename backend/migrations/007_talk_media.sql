-- Stored slide images (CLAUDE.md §7 deck_media). Objects live in object
-- storage (local disk in dev); rows carry the intrinsic size read from the
-- bytes at ingest so the exporter and the PDF renderer never guess an
-- aspect ratio (§3.5). Rows go with the talk; the objects are deleted by
-- services/talkMedia.ts on talk deletion — an orphaned object is storage
-- nobody can reach and nobody is counting.

CREATE TABLE IF NOT EXISTS talk_media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talk_id       UUID NOT NULL REFERENCES talks(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slide_index   INTEGER NOT NULL,
  storage_path  TEXT NOT NULL,
  -- 'image/png' | 'image/jpeg' — the only two that go into decks and PDFs
  mime          TEXT NOT NULL,
  width         INTEGER NOT NULL,
  height        INTEGER NOT NULL,
  bytes         INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS talk_media_talk_idx ON talk_media (talk_id);
