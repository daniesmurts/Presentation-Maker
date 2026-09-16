-- TODO M phase 4 follow-up: the fraud gates left open when referrals
-- shipped (2026-09-16) — added before real traffic, per the note in
-- TODO.md. Expand-only.

-- The IP a user registered from — the only IP the app has ever recorded.
-- Compared only against another signup_ip, never used for anything else.
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_ip TEXT;

-- 'blocked': a referral the fraud checks refused to reward (same card at
-- payment time). Distinct from 'clawed_back' (was rewarded, then a refund
-- reversed it) — a blocked referral was never rewarded at all.
ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_status_check;
ALTER TABLE referrals ADD CONSTRAINT referrals_status_check
  CHECK (status IN ('signed_up', 'paid', 'rewarded', 'capped', 'clawed_back', 'blocked'));
