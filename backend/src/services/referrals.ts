import { randomBytes } from 'node:crypto'
import { logger } from '../lib/logger'
import { recordTalkEvent } from '../db/queries/talkEvents'
import { planGrant } from './adminActions'
import { pool } from '../db/connection'
import {
  getReferralCode, trySetReferralCode, findWorkspaceByReferralCode, getReferredBy, attachReferral,
  findReferralByReferee, countRewardedSince, markReferralPaid, markReferralRewarded, markReferralCapped,
  markReferralClawedBack, markReferralBlocked, findReferralByPaymentId, referralSummary, listAdminReferrals, referralFunnel,
  getReferrerFraudContext,
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
/** A referee signing up from the referrer's own IP this soon after the
 *  referrer's own signup reads as one person, one sitting — not two real
 *  invitations. Outside this window the same IP is just as likely a
 *  household or an office, so it is flagged for an admin, not blocked. */
export const FRAUD_IP_WINDOW_MINUTES = 60

// ── Fraud checks (added before the first real traffic, per the note this
// left in TODO.md on 2026-09-16) ────────────────────────────────────────────

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

/** Plus-addressing (`+tag`) strips on every provider that supports it;
 *  dot-insensitivity is Gmail-specific — `a.b@gmail.com` and `ab@gmail.com`
 *  are the same inbox there, not everywhere. */
export function normaliseEmailForFraud(raw: string): string {
  const email = raw.trim().toLowerCase()
  const at = email.indexOf('@')
  if (at === -1) return email
  let local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const plus = local.indexOf('+')
  if (plus !== -1) local = local.slice(0, plus)
  if (GMAIL_DOMAINS.has(domain)) local = local.replace(/\./g, '')
  return `${local}@${domain}`
}

export interface SignupFraudCheck { block: boolean; flag: { reason: string } | null }

/** Checked at registration, before a referral is ever attached. `block`
 *  means: do not attach — the signup proceeds normally, just with no
 *  referral (never surfaced to the user, who did nothing wrong from their
 *  side of a fake pair). `flag` means: attach it, but an admin sees why. */
export function checkSignupFraud(
  referrer: { ownerEmail: string | null; signupIp: string | null; createdAt: Date },
  referee: { email: string; ip: string | null; createdAt: Date },
): SignupFraudCheck {
  if (referrer.ownerEmail && normaliseEmailForFraud(referrer.ownerEmail) === normaliseEmailForFraud(referee.email)) {
    return { block: true, flag: null }
  }
  if (referrer.signupIp && referee.ip && referrer.signupIp === referee.ip) {
    const minutesApart = Math.abs(referee.createdAt.getTime() - referrer.createdAt.getTime()) / 60_000
    if (minutesApart <= FRAUD_IP_WINDOW_MINUTES) return { block: true, flag: null }
    return { block: false, flag: { reason: 'same_ip' } }
  }
  return { block: false, flag: null }
}

/** Checked at reward time, not at signup — the referee's card is only
 *  known once they've paid. Either signal alone (the saved-card token, or
 *  just the last four digits) is enough to hold the reward for review;
 *  the discount the referee already used is not reversed — it is small
 *  next to a month of Pro, and clawing it back mid-subscription is not
 *  worth the support cost for what a false positive would cause. */
function sameCard(a: { tbank_rebill_id: string | null; card_last4: string | null }, b: { tbank_rebill_id: string | null; card_last4: string | null }): boolean {
  if (a.tbank_rebill_id && b.tbank_rebill_id && a.tbank_rebill_id === b.tbank_rebill_id) return true
  if (a.card_last4 && b.card_last4 && a.card_last4 === b.card_last4) return true
  return false
}

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
export async function attachReferralOnSignup(refereeWorkspaceId: string, rawRef: string | null | undefined, refereeEmail: string, refereeIp: string | null): Promise<void> {
  const code = typeof rawRef === 'string' ? rawRef.trim().toUpperCase() : ''
  if (!code) return
  try {
    const referrer = await findWorkspaceByReferralCode(code)
    if (!referrer || referrer.id === refereeWorkspaceId) return
    const ctx = await getReferrerFraudContext(referrer.id)
    if (!ctx) return
    const check = checkSignupFraud(
      { ownerEmail: ctx.ownerEmail, signupIp: ctx.signupIp, createdAt: new Date(ctx.createdAt) },
      { email: refereeEmail, ip: refereeIp, createdAt: new Date() },
    )
    if (check.block) {
      logger.warn({ message: 'Referral signup blocked by fraud check', referrerWorkspaceId: referrer.id })
      return
    }
    await attachReferral(refereeWorkspaceId, referrer.id, check.flag ?? undefined)
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

  // Only known once the referee has actually paid — the card comparison
  // could not run any earlier than this.
  const [referrerCard, refereeCard] = await Promise.all([getWorkspaceBilling(referral.referrer_workspace_id), getWorkspaceBilling(refereeWorkspaceId)])
  if (referrerCard && refereeCard && sameCard(referrerCard, refereeCard)) {
    await markReferralBlocked(referral.id, 'same_card')
    logger.warn({ message: 'Referral reward blocked — referrer and referee share a card', referrerWorkspaceId: referral.referrer_workspace_id, refereeWorkspaceId })
    return
  }

  const rewardedThisYear = await countRewardedSince(referral.referrer_workspace_id, new Date(Date.now() - 365 * 86_400_000))
  if (rewardedThisYear >= REFERRAL_MAX_REWARDS_PER_YEAR) {
    await markReferralCapped(referral.id)
    logger.info({ message: 'Referral reward capped for the year', referrerWorkspaceId: referral.referrer_workspace_id })
    return
  }

  if (!referrerCard) return
  const after = planGrant(referrerCard, REFERRAL_REFERRER_REWARD_DAYS)
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
