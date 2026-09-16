import { Router } from 'express'
import { asyncHandler } from '../lib/asyncHandler'
import { authenticate } from '../middleware/authenticate'
import { ensureReferralCode, referralSummary, REFERRAL_INVITEE_DISCOUNT_PERCENT, REFERRAL_REFERRER_REWARD_DAYS } from '../services/referrals'
import { config } from '../lib/config'

export const referralsRouter = Router()
referralsRouter.use(authenticate)

// GET /api/referrals/me — the card on the tariff page: link, copy, counts.
// Generates the code on first call; every call after just reads it.
referralsRouter.get('/me', asyncHandler(async (req, res) => {
  await ensureReferralCode(req.user.workspace_id)
  const summary = await referralSummary(req.user.workspace_id)
  res.json({
    ...summary,
    url: summary.code ? `${config.frontendUrl}/register?ref=${summary.code}` : null,
    invitee_discount_percent: REFERRAL_INVITEE_DISCOUNT_PERCENT,
    referrer_reward_days: REFERRAL_REFERRER_REWARD_DAYS,
  })
}))
