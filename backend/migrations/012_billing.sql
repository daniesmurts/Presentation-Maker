-- Billing: the Pro subscription paid through T-Bank internet acquiring
-- (developer.tbank.ru/eacq). Expand-only (CLAUDE.md §3.11).
--
-- plan_tier stays the gate column — it is what findPublicUserById joins and
-- what every assert in lib/planTier.ts reads. The webhook sets it to 'pro'
-- on a CONFIRMED payment; only the expiry job (services/billing.ts) sets it
-- back to 'free', after a grace period — a lagging webhook or a lost
-- renewal must never flip a paying customer to free at midnight.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS plan_expires_at    TIMESTAMPTZ,            -- Pro paid until; NULL for free
  ADD COLUMN IF NOT EXISTS tbank_rebill_id    TEXT,                   -- saved-card token for /v2/Charge
  ADD COLUMN IF NOT EXISTS card_last4         TEXT,                   -- from Pan «430000******0777», for the page
  ADD COLUMN IF NOT EXISTS auto_renew         BOOLEAN  NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS renewal_failures   SMALLINT NOT NULL DEFAULT 0;

-- One row per Init. status is T-Bank's status string verbatim (NEW,
-- FORM_SHOWED, AUTHORIZED, CONFIRMED, REJECTED, AUTH_FAIL, DEADLINE_EXPIRED,
-- CANCELED, REFUNDED, PARTIAL_REFUNDED) — no enum, their list changes.
CREATE TABLE IF NOT EXISTS payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  order_id          TEXT NOT NULL UNIQUE,   -- what we send as OrderId (≤50 chars)
  tbank_payment_id  TEXT,                   -- PaymentId from Init
  kind              TEXT NOT NULL,          -- 'initial' | 'renewal'
  amount_kopecks    INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'NEW',
  error_code        TEXT,
  period_start      TIMESTAMPTZ,            -- what this payment bought, set on CONFIRMED
  period_end        TIMESTAMPTZ,
  raw_notification  JSONB,                  -- last webhook body, for incidents (never shown)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_workspace_idx ON payments (workspace_id, created_at DESC);
