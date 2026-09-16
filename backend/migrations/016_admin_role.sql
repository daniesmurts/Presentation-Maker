-- TODO M phase 1: the admin role. Set only from ADMIN_EMAILS (env) at boot
-- and at registration — never from the UI, so an admin cannot be created
-- or removed by another admin's mistake. Expand-only.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
