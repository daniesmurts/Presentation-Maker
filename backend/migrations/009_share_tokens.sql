-- Read-only share link per talk (CLAUDE.md §5.6): a view link, no account.
-- The token is the whole credential — 32 random bytes, base64url — so it
-- is unique and unguessable; NULL means not shared. Revoking = NULL.

ALTER TABLE talks ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;
ALTER TABLE talks ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ;
