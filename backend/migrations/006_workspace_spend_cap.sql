-- Per-workspace override of the monthly model-spend cap (services/spendCap.ts).
-- NULL → the plan tier's default. An operator raises it for one customer
-- without touching the tier table; expand-only, nothing dropped.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS monthly_spend_cap_usd NUMERIC(10,2);
