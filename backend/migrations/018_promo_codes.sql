-- TODO M phase 3: promo codes. Expand-only.

CREATE TABLE IF NOT EXISTS promo_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,             -- stored uppercase; the thing a user types
  -- percent: value 1-99, off the price. fixed: value in kopecks, off the
  -- price. free_months: value = months of Pro granted directly, no T-Bank
  -- charge at all — works even with billing off (services/promoCodes.ts).
  kind        TEXT NOT NULL CHECK (kind IN ('percent', 'fixed', 'free_months')),
  value       INTEGER NOT NULL CHECK (value > 0),
  max_uses    INTEGER,                          -- NULL = unlimited
  valid_until TIMESTAMPTZ,                       -- NULL = no expiry
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One redemption per workspace per code — simplest rule that covers every
-- campaign this product runs; a code meant to be reusable by the same
-- workspace is a different code each time.
CREATE TABLE IF NOT EXISTS promo_redemptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id     UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  payment_id        UUID REFERENCES payments(id) ON DELETE SET NULL,   -- NULL for free_months
  discount_kopecks  INTEGER,                     -- percent/fixed: what was taken off
  months_granted    INTEGER,                     -- free_months: what was given
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (promo_code_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS promo_redemptions_code_idx ON promo_redemptions (promo_code_id);

-- Which code an initial payment used, so a receipt or a refund can be
-- traced back to a campaign. NULL for every payment before this.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES promo_codes(id) ON DELETE SET NULL;
