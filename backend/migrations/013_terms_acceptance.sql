-- Consent evidence (152-ФЗ): when a user accepted the terms and privacy
-- policy, and which version. Expand-only; NULL for accounts that predate
-- the checkbox (2026-09-14) — the app may ask them at next sign-in later.
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version     TEXT;
