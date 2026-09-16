-- TODO M phase 2: the admin's first writes, each recorded. Expand-only.

-- Every admin write: who, what, on which row, the row before and after,
-- and why. Reads are not logged.
CREATE TABLE IF NOT EXISTS admin_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,                     -- 'grant_pro' | 'revoke_grant' | 'set_spend_cap' | 'deactivate_user' | 'reactivate_user' | 'support_answered' | …
  target_kind  TEXT NOT NULL,                     -- 'workspace' | 'user' | 'support_message'
  target_id    UUID NOT NULL,
  before       JSONB,
  after        JSONB,
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_actions_target_idx ON admin_actions (target_kind, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_actions_created_idx ON admin_actions (created_at DESC);

-- Where the current Pro came from. 'paid' is what every existing Pro row
-- is; 'granted' is an admin's gift — the renew job skips it (a gift is
-- not a charge), the expire job drops it like a paid month, and the next
-- confirmed payment turns it back into 'paid'.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS plan_source TEXT NOT NULL DEFAULT 'paid';

-- A deactivated user keeps every row (152-ФЗ deletion is its own flow);
-- the session middleware and login refuse them.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ;
ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS answered_by UUID REFERENCES users(id) ON DELETE SET NULL;
