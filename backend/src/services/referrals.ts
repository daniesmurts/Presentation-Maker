import { randomBytes } from 'node:crypto'
import { logger } from '../lib/logger'
import { recordTalkEvent } from '../db/queries/talkEvents'
import { planGrant } from './adminActions'
import { pool } from '../db/connection'
import {
  getReferralCode, trySetReferralCode, findWorkspaceByReferralCode, getReferredBy, attachReferral,
  findReferralByReferee, countRewardedSince, markReferralPaid, markReferralRewarded, markReferralCapped,
  markReferralClawedBack, findReferralByPaymentId, referralSummary, listAdminReferrals, referralFunnel,
} from '../db/queries/referrals'
import { getWorkspaceBilling } from '../db/queries/billing'
import { createPromoCode } from '../db/queries/promoCodes'

// Referrals (TODO M phase 4). A referral link is a workspace's own code —
// not a marketing promo code, so it never touches promo_codes and it never
// expires or runs out. The invitee's discount goes through the ordinary
// promo/checkout path (services/promoCodes.ts applyPromoToCharge) using
// this same code string; the referrer's reward is a direct grant, the
// identical rule an admin's gift uses (planGrant).

export const REFERRAL_INVITEE_DISCOUNT_PERCENT = 20
export const REFERRAL_REFERRER_REWARD_DAYS = 30
export const REFERRAL_MAX_REWARDS_PER_YEAR = 12

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   // no 0/O/1/I — read aloud, typed by hand
function randomCode(len = 7): string {
  const bytes = randomBytes(len)
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

/** Lazily generated, once, on first request — most workspaces never open
 *  the referral card. The code is a real promo_codes row (percent,
 *  unlimited, no expiry) so the invitee's discount runs through the exact
 *  same validate/checkout/redeem path a marketing code does. */
export async function ensureReferralCode(workspaceId: string): Promise<string> {
  const existing = await getReferralCode(workspaceId)
  if (existing) return existing
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode()
    if (!(await trySetReferralCode(workspaceId, code))) continue
    try {
      await createPromoCode({ code, kind: 'percent', value: REFERRAL_INVITEE_DISCOUNT_PERCENT, maxUses: null, validUntil: null, createdBy: null, ownerWorkspaceId: workspaceId })
      return code
    } catch (err) {
      // Leaves no orphan: the workspace's referral_code is only ever read
      // together with its promo_codes row, never trusted alone.
      await pool.query(`UPDATE workspaces SET referral_code = NULL WHERE id = $1 AND referral_code = $2`, [workspaceId, code])
      logger.warn({ message: 'Referral code collided at the promo_codes level, retrying', error: (err as Error).message })
    }
  }
  throw new Error('Could not allocate a unique referral code')
}

/** The referee's automatic discount, if this workspace was referred and its
 *  referrer still has a code — resolved fresh every checkout, never cached. */
export async function referrerDiscountCode(workspaceId: string): Promise<string | null> {
  const referrerId = await getReferredBy(workspaceId)
  if (!referrerId) return null
  return getReferralCode(referrerId)
}

/** Registration: `ref` is whatever the user typed or arrived with in the
 *  URL — untrusted, and a bad or missing code must never fail signup. */
export async function attachReferralOnSignup(refereeWorkspaceId: string, rawRef: string | null | undefined): Promise<void> {
  const code = typeof rawRef === 'string' ? rawRef.trim().toUpperCase() : ''
  if (!code) return
  try {
    const referrer = await findWorkspaceByReferralCode(code)
    if (!referrer || referrer.id === refereeWorkspaceId) return
    await attachReferral(refereeWorkspaceId, referrer.id)
  } catch (err) {
    logger.warn({ message: 'Referral attach failed (non-fatal)', error: (err as Error).message })
  }
}

/** Called once the referee's first ('initial') payment is CONFIRMED
 *  (services/billing.ts applyOutcome). Reward is on the payment, not the
 *  discount — a referee who paid full price still earns their referrer
 *  the reward. */
export async function rewardReferralOnPayment(refereeWorkspaceId: string, paymentId: string): Promise<void> {
  const referral = await findReferralByReferee(refereeWorkspaceId)
  if (!referral || referral.status !== 'signed_up') return
  await markReferralPaid(referral.id, paymentId)

  const rewardedThisYear = await countRewardedSince(referral.referrer_workspace_id, new Date(Date.now() - 365 * 86_400_000))
  if (rewardedThisYear >= REFERRAL_MAX_REWARDS_PER_YEAR) {
    await markReferralCapped(referral.id)
    logger.info({ message: 'Referral reward capped for the year', referrerWorkspaceId: referral.referrer_workspace_id })
    return
  }

  const ws = await getWorkspaceBilling(referral.referrer_workspace_id)
  if (!ws) return
  const after = planGrant(ws, REFERRAL_REFERRER_REWARD_DAYS)
  await pool.query(`UPDATE workspaces SET plan_tier = $2, plan_expires_at = $3, plan_source = $4, renewal_failures = 0 WHERE id = $1`,
    [referral.referrer_workspace_id, after.plan_tier, after.plan_expires_at, after.plan_source])
  await markReferralRewarded(referral.id, REFERRAL_REFERRER_REWARD_DAYS)
  recordTalkEvent({ talkId: null, workspaceId: referral.referrer_workspace_id, userId: null, event: 'referral_rewarded', metadata: { days: REFERRAL_REFERRER_REWARD_DAYS, referee_workspace_id: refereeWorkspaceId } })
  logger.info({ message: 'Referral rewarded', referrerWorkspaceId: referral.referrer_workspace_id, refereeWorkspaceId })
}

/** A full refund of the referee's rewarding payment, inside the reward's
 *  own window — services/billing.ts applyOutcome REFUNDED branch. Only
 *  touches a grant still standing (plan_source='granted'); if the
 *  referrer has since paid for real, their subscription is untouched. */
export async function clawBackReferralOnRefund(paymentId: string): Promise<void> {
  const referral = await findReferralByPaymentId(paymentId)
  if (!referral || referral.status !== 'rewarded') return
  const ws = await getWorkspaceBilling(referral.referrer_workspace_id)
  if (ws?.plan_tier === 'pro' && ws.plan_source === 'granted') {
    await pool.query(`UPDATE workspaces SET plan_tier = 'free', plan_expires_at = NULL, plan_source = 'paid' WHERE id = $1`, [referral.referrer_workspace_id])
    logger.warn({ message: 'Referral reward clawed back on refund', referrerWorkspaceId: referral.referrer_workspace_id })
  }
  await markReferralClawedBack(referral.id)
}

export { referralSummary, listAdminReferrals, referralFunnel }
