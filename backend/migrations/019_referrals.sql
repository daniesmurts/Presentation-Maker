-- TODO M phase 4: referrals. A referral link is a per-workspace promo code
-- (percent off, unlimited uses); the reward is a grant on the referrer's
-- workspace once the referee's first payment is confirmed. Expand-only.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
-- Set once, at registration, from ?ref=CODE. Never changes after.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS referred_by_workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

-- A referral code IS a promo_codes row (percent, unlimited uses, no
-- expiry) — the invitee's discount goes through the exact same validation,
-- checkout, and redemption path a marketing code does; owner_workspace_id
-- just marks it as system-managed instead of admin-created, and keeps it
-- out of the campaign-codes admin list.
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS owner_workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_owner_workspace_idx ON promo_codes (owner_workspace_id) WHERE owner_workspace_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS referrals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- One referral per referee, ever — the workspace's referred_by_workspace_id
  -- is set once and this row is its ledger entry.
  referee_workspace_id  UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'signed_up' CHECK (status IN ('signed_up', 'paid', 'rewarded', 'capped', 'clawed_back')),
  referee_payment_id    UUID REFERENCES payments(id) ON DELETE SET NULL,
  reward_days           INTEGER,
  flagged               BOOLEAN NOT NULL DEFAULT FALSE,
  flag_reason           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at               TIMESTAMPTZ,
  rewarded_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_workspace_id, created_at DESC);
