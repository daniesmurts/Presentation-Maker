-- Sign in with Yandex ID (OAuth 2.0). An account can now exist without a
-- password — Yandex vouches for identity instead — so password_hash must
-- become nullable; existing rows are untouched (expand-only).
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- The Yandex-side user id (`id` from https://login.yandex.ru/info), not
-- their login name (that can be changed on Yandex's side). NULL for every
-- account that has never linked Yandex. Unique so the callback can look a
-- returning user up directly instead of by email every time.
ALTER TABLE users ADD COLUMN IF NOT EXISTS yandex_id TEXT UNIQUE;
