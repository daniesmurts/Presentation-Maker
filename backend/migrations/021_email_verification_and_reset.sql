-- Email confirmation + password reset. Both were completely absent —
-- signup logs a user in with no ownership proof of the address, and a
-- locked-out user had no self-service recovery path at all.
--
-- Verification is a soft gate (decided 2026-09-16): it never blocks signup
-- or login, only shows a dismissible-by-verifying banner. NULL means
-- unverified, including every account that predates this column.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- One-time, short-lived reset tokens. The raw token is emailed; only its
-- hash is stored (SHA-256 is enough for a random 32-byte single-use token —
-- bcrypt's slowness buys nothing here, CLAUDE.md's Teaching-assistant sibling
-- made the same call).
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_hash_idx ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens (user_id);
