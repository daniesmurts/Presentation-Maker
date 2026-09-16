-- Evidence of consent to recurring charges. T-Bank enables Recurrent/Charge
-- only for a merchant that shows the amount and periodicity before payment
-- and has the buyer tick a box themselves (their letter, 2026-09-16); a
-- chargeback is answered with a timestamp, the exact sentence shown and the
-- address it was ticked from. Expand-only (CLAUDE.md §3.11).

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS recurring_consent_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recurring_consent_text TEXT,
  ADD COLUMN IF NOT EXISTS recurring_consent_ip   TEXT;

-- The latest consent for the workspace: set on a consented checkout and
-- again when auto-renew is switched back on from the tariff page.
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS recurring_consent_at TIMESTAMPTZ;
