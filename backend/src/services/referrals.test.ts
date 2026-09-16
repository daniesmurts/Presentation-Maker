import { describe, it, expect, vi, beforeEach } from 'vitest'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock('../db/connection', () => ({ pool: { query: queryMock } }))
vi.mock('../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const referralQueries = vi.hoisted(() => ({
  getReferralCode: vi.fn(), trySetReferralCode: vi.fn(), findWorkspaceByReferralCode: vi.fn(), getReferredBy: vi.fn(),
  attachReferral: vi.fn(), getReferrerFraudContext: vi.fn(), findReferralByReferee: vi.fn(), countRewardedSince: vi.fn(),
  markReferralPaid: vi.fn(), markReferralRewarded: vi.fn(), markReferralCapped: vi.fn(), markReferralClawedBack: vi.fn(),
  markReferralBlocked: vi.fn(), findReferralByPaymentId: vi.fn(), referralSummary: vi.fn(), listAdminReferrals: vi.fn(), referralFunnel: vi.fn(),
}))
vi.mock('../db/queries/referrals', () => referralQueries)

const billingQueries = vi.hoisted(() => ({ getWorkspaceBilling: vi.fn() }))
vi.mock('../db/queries/billing', () => billingQueries)

const promoQueries = vi.hoisted(() => ({ createPromoCode: vi.fn() }))
vi.mock('../db/queries/promoCodes', () => promoQueries)

vi.mock('../db/queries/talkEvents', () => ({ recordTalkEvent: vi.fn() }))

import {
  attachReferralOnSignup, rewardReferralOnPayment, clawBackReferralOnRefund, ensureReferralCode,
  normaliseEmailForFraud, checkSignupFraud, REFERRAL_MAX_REWARDS_PER_YEAR, REFERRAL_REFERRER_REWARD_DAYS, FRAUD_IP_WINDOW_MINUTES,
} from './referrals'

beforeEach(() => {
  queryMock.mockReset()
  Object.values(referralQueries).forEach((m) => m.mockReset())
  Object.values(billingQueries).forEach((m) => m.mockReset())
  Object.values(promoQueries).forEach((m) => m.mockReset())
})

describe('normaliseEmailForFraud', () => {
  it('strips a +tag on any provider', () => {
    expect(normaliseEmailForFraud('Ivan+promo@example.com')).toBe('ivan@example.com')
  })
  it('strips dots only for Gmail-family domains', () => {
    expect(normaliseEmailForFraud('i.van@gmail.com')).toBe('ivan@gmail.com')
    expect(normaliseEmailForFraud('i.van@googlemail.com')).toBe('ivan@googlemail.com')
    expect(normaliseEmailForFraud('i.van@example.com')).toBe('i.van@example.com')
  })
})

describe('checkSignupFraud', () => {
  const now = new Date('2026-09-16T12:00:00Z')
  const referrer = (over: object = {}) => ({ ownerEmail: 'ref@example.com', signupIp: '1.2.3.4', createdAt: now, ...over })
  const referee = (over: object = {}) => ({ email: 'other@example.com', ip: '5.6.7.8', createdAt: now, ...over })

  it('blocks on a matching normalised e-mail, regardless of IP', () => {
    const r = checkSignupFraud(referrer(), referee({ email: 'REF+x@example.com', ip: null }))
    expect(r).toEqual({ block: true, flag: null })
  })
  it('blocks the same IP within the window', () => {
    const r = checkSignupFraud(referrer(), referee({ ip: '1.2.3.4', createdAt: new Date(now.getTime() + 10 * 60_000) }))
    expect(r).toEqual({ block: true, flag: null })
  })
  it('only flags the same IP outside the window', () => {
    const r = checkSignupFraud(referrer(), referee({ ip: '1.2.3.4', createdAt: new Date(now.getTime() + (FRAUD_IP_WINDOW_MINUTES + 1) * 60_000) }))
    expect(r).toEqual({ block: false, flag: { reason: 'same_ip' } })
  })
  it('does nothing for an unrelated signup', () => {
    expect(checkSignupFraud(referrer(), referee())).toEqual({ block: false, flag: null })
  })
})

describe('attachReferralOnSignup', () => {
  it('does nothing for an empty or missing code', async () => {
    await attachReferralOnSignup('referee', '', 'a@b.com', '1.1.1.1')
    await attachReferralOnSignup('referee', undefined, 'a@b.com', '1.1.1.1')
    expect(referralQueries.findWorkspaceByReferralCode).not.toHaveBeenCalled()
  })
  it('ignores an unknown code and a self-referral, never throwing', async () => {
    referralQueries.findWorkspaceByReferralCode.mockResolvedValueOnce(null)
    await expect(attachReferralOnSignup('referee', 'NOPE', 'a@b.com', null)).resolves.toBeUndefined()
    referralQueries.findWorkspaceByReferralCode.mockResolvedValueOnce({ id: 'referee' })
    await attachReferralOnSignup('referee', 'SELF', 'a@b.com', null)
    expect(referralQueries.attachReferral).not.toHaveBeenCalled()
  })
  it('attaches a valid, unrelated referral, case-insensitively', async () => {
    referralQueries.findWorkspaceByReferralCode.mockResolvedValueOnce({ id: 'referrer-1' })
    referralQueries.getReferrerFraudContext.mockResolvedValueOnce({ ownerEmail: 'referrer@example.com', signupIp: null, createdAt: new Date().toISOString() })
    await attachReferralOnSignup('referee-1', ' abc123 ', 'someone@example.com', '9.9.9.9')
    expect(referralQueries.findWorkspaceByReferralCode).toHaveBeenCalledWith('ABC123')
    expect(referralQueries.attachReferral).toHaveBeenCalledWith('referee-1', 'referrer-1', undefined)
  })
  it('does not attach when the fraud check blocks it', async () => {
    referralQueries.findWorkspaceByReferralCode.mockResolvedValueOnce({ id: 'referrer-1' })
    referralQueries.getReferrerFraudContext.mockResolvedValueOnce({ ownerEmail: 'referrer@example.com', signupIp: null, createdAt: new Date().toISOString() })
    await attachReferralOnSignup('referee-1', 'ABC123', 'referrer+x@example.com', null)
    expect(referralQueries.attachReferral).not.toHaveBeenCalled()
  })
  it('attaches with a flag when the fraud check only flags', async () => {
    const now = new Date()
    referralQueries.findWorkspaceByReferralCode.mockResolvedValueOnce({ id: 'referrer-1' })
    referralQueries.getReferrerFraudContext.mockResolvedValueOnce({ ownerEmail: 'referrer@example.com', signupIp: '1.2.3.4', createdAt: new Date(now.getTime() - (FRAUD_IP_WINDOW_MINUTES + 5) * 60_000).toISOString() })
    await attachReferralOnSignup('referee-1', 'ABC123', 'someone@example.com', '1.2.3.4')
    expect(referralQueries.attachReferral).toHaveBeenCalledWith('referee-1', 'referrer-1', { reason: 'same_ip' })
  })
  it('swallows a DB error rather than failing registration', async () => {
    referralQueries.findWorkspaceByReferralCode.mockRejectedValueOnce(new Error('db down'))
    await expect(attachReferralOnSignup('referee', 'X', 'a@b.com', null)).resolves.toBeUndefined()
  })
})

describe('rewardReferralOnPayment', () => {
  const referral = { id: 'r1', referrer_workspace_id: 'referrer', referee_workspace_id: 'referee', status: 'signed_up' as const }
  const cardA = { id: 'referrer', plan_tier: 'free', plan_source: 'paid', plan_expires_at: null, tbank_rebill_id: 'rebill-A', card_last4: '1111' }
  const cardB = { id: 'referee', plan_tier: 'free', plan_source: 'paid', plan_expires_at: null, tbank_rebill_id: 'rebill-B', card_last4: '2222' }

  it('does nothing when there is no referral, or it is past signed_up', async () => {
    referralQueries.findReferralByReferee.mockResolvedValueOnce(null)
    await rewardReferralOnPayment('referee', 'pay1')
    referralQueries.findReferralByReferee.mockResolvedValueOnce({ ...referral, status: 'rewarded' })
    await rewardReferralOnPayment('referee', 'pay1')
    expect(referralQueries.markReferralPaid).not.toHaveBeenCalled()
  })

  it('marks paid, then rewards the referrer under the yearly cap when the cards differ', async () => {
    referralQueries.findReferralByReferee.mockResolvedValueOnce(referral)
    billingQueries.getWorkspaceBilling.mockResolvedValueOnce(cardA).mockResolvedValueOnce(cardB)
    referralQueries.countRewardedSince.mockResolvedValueOnce(REFERRAL_MAX_REWARDS_PER_YEAR - 1)
    await rewardReferralOnPayment('referee', 'pay1')
    expect(referralQueries.markReferralPaid).toHaveBeenCalledWith('r1', 'pay1')
    expect(referralQueries.markReferralBlocked).not.toHaveBeenCalled()
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('UPDATE workspaces'), expect.arrayContaining(['referrer', 'pro', expect.any(Date), 'granted']))
    expect(referralQueries.markReferralRewarded).toHaveBeenCalledWith('r1', REFERRAL_REFERRER_REWARD_DAYS)
  })

  it('blocks the reward when the referrer and referee share a saved card', async () => {
    referralQueries.findReferralByReferee.mockResolvedValueOnce(referral)
    billingQueries.getWorkspaceBilling.mockResolvedValueOnce(cardA).mockResolvedValueOnce({ ...cardB, tbank_rebill_id: cardA.tbank_rebill_id })
    await rewardReferralOnPayment('referee', 'pay1')
    expect(referralQueries.markReferralBlocked).toHaveBeenCalledWith('r1', 'same_card')
    expect(referralQueries.countRewardedSince).not.toHaveBeenCalled()
    expect(referralQueries.markReferralRewarded).not.toHaveBeenCalled()
  })

  it('blocks on a matching card_last4 even with different rebill ids', async () => {
    referralQueries.findReferralByReferee.mockResolvedValueOnce(referral)
    billingQueries.getWorkspaceBilling.mockResolvedValueOnce(cardA).mockResolvedValueOnce({ ...cardB, card_last4: cardA.card_last4 })
    await rewardReferralOnPayment('referee', 'pay1')
    expect(referralQueries.markReferralBlocked).toHaveBeenCalledWith('r1', 'same_card')
  })

  it('caps at the yearly limit and marks the referral capped, not rewarded', async () => {
    referralQueries.findReferralByReferee.mockResolvedValueOnce(referral)
    billingQueries.getWorkspaceBilling.mockResolvedValueOnce(cardA).mockResolvedValueOnce(cardB)
    referralQueries.countRewardedSince.mockResolvedValueOnce(REFERRAL_MAX_REWARDS_PER_YEAR)
    await rewardReferralOnPayment('referee', 'pay1')
    expect(referralQueries.markReferralCapped).toHaveBeenCalledWith('r1')
    expect(referralQueries.markReferralRewarded).not.toHaveBeenCalled()
  })
})

describe('clawBackReferralOnRefund', () => {
  it('does nothing when there is no rewarded referral for this payment', async () => {
    referralQueries.findReferralByPaymentId.mockResolvedValueOnce(null)
    await clawBackReferralOnRefund('pay1')
    expect(queryMock).not.toHaveBeenCalled()
  })

  it('reverts a grant still standing', async () => {
    referralQueries.findReferralByPaymentId.mockResolvedValueOnce({ id: 'r1', referrer_workspace_id: 'referrer', status: 'rewarded' })
    billingQueries.getWorkspaceBilling.mockResolvedValueOnce({ plan_tier: 'pro', plan_source: 'granted' })
    await clawBackReferralOnRefund('pay1')
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining("plan_tier = 'free'"), ['referrer'])
    expect(referralQueries.markReferralClawedBack).toHaveBeenCalledWith('r1')
  })

  it('leaves a since-paid subscription alone — only touches a grant still standing', async () => {
    referralQueries.findReferralByPaymentId.mockResolvedValueOnce({ id: 'r1', referrer_workspace_id: 'referrer', status: 'rewarded' })
    billingQueries.getWorkspaceBilling.mockResolvedValueOnce({ plan_tier: 'pro', plan_source: 'paid' })
    await clawBackReferralOnRefund('pay1')
    expect(queryMock).not.toHaveBeenCalled()
    expect(referralQueries.markReferralClawedBack).toHaveBeenCalledWith('r1')
  })
})

describe('ensureReferralCode', () => {
  it('returns the existing code without allocating a new one', async () => {
    referralQueries.getReferralCode.mockResolvedValueOnce('EXISTING')
    expect(await ensureReferralCode('ws1')).toBe('EXISTING')
    expect(referralQueries.trySetReferralCode).not.toHaveBeenCalled()
  })

  it('allocates a code and its backing promo_codes row together', async () => {
    referralQueries.getReferralCode.mockResolvedValueOnce(null)
    referralQueries.trySetReferralCode.mockResolvedValueOnce(true)
    promoQueries.createPromoCode.mockResolvedValueOnce({})
    const code = await ensureReferralCode('ws1')
    expect(code).toMatch(/^[A-Z2-9]{7}$/)
    expect(promoQueries.createPromoCode).toHaveBeenCalledWith(expect.objectContaining({ code, kind: 'percent', ownerWorkspaceId: 'ws1' }))
  })
})
