import { describe, it, expect, vi, beforeEach } from 'vitest'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock('../db/connection', () => ({ pool: { query: queryMock } }))
vi.mock('../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const referralQueries = vi.hoisted(() => ({
  getReferralCode: vi.fn(), trySetReferralCode: vi.fn(), findWorkspaceByReferralCode: vi.fn(), getReferredBy: vi.fn(),
  attachReferral: vi.fn(), findReferralByReferee: vi.fn(), countRewardedSince: vi.fn(), markReferralPaid: vi.fn(),
  markReferralRewarded: vi.fn(), markReferralCapped: vi.fn(), markReferralClawedBack: vi.fn(), findReferralByPaymentId: vi.fn(),
  referralSummary: vi.fn(), listAdminReferrals: vi.fn(), referralFunnel: vi.fn(),
}))
vi.mock('../db/queries/referrals', () => referralQueries)

const billingQueries = vi.hoisted(() => ({ getWorkspaceBilling: vi.fn() }))
vi.mock('../db/queries/billing', () => billingQueries)

const promoQueries = vi.hoisted(() => ({ createPromoCode: vi.fn() }))
vi.mock('../db/queries/promoCodes', () => promoQueries)

vi.mock('../db/queries/talkEvents', () => ({ recordTalkEvent: vi.fn() }))

import {
  attachReferralOnSignup, rewardReferralOnPayment, clawBackReferralOnRefund, ensureReferralCode,
  REFERRAL_MAX_REWARDS_PER_YEAR, REFERRAL_REFERRER_REWARD_DAYS,
} from './referrals'

beforeEach(() => {
  queryMock.mockReset()
  Object.values(referralQueries).forEach((m) => m.mockReset())
  Object.values(billingQueries).forEach((m) => m.mockReset())
  Object.values(promoQueries).forEach((m) => m.mockReset())
})

describe('attachReferralOnSignup', () => {
  it('does nothing for an empty or missing code', async () => {
    await attachReferralOnSignup('referee', '')
    await attachReferralOnSignup('referee', undefined)
    expect(referralQueries.findWorkspaceByReferralCode).not.toHaveBeenCalled()
  })
  it('ignores an unknown code and a self-referral, never throwing', async () => {
    referralQueries.findWorkspaceByReferralCode.mockResolvedValueOnce(null)
    await expect(attachReferralOnSignup('referee', 'NOPE')).resolves.toBeUndefined()
    referralQueries.findWorkspaceByReferralCode.mockResolvedValueOnce({ id: 'referee' })
    await attachReferralOnSignup('referee', 'SELF')
    expect(referralQueries.attachReferral).not.toHaveBeenCalled()
  })
  it('attaches a valid referral, case-insensitively', async () => {
    referralQueries.findWorkspaceByReferralCode.mockResolvedValueOnce({ id: 'referrer-1' })
    await attachReferralOnSignup('referee-1', ' abc123 ')
    expect(referralQueries.findWorkspaceByReferralCode).toHaveBeenCalledWith('ABC123')
    expect(referralQueries.attachReferral).toHaveBeenCalledWith('referee-1', 'referrer-1')
  })
  it('swallows a DB error rather than failing registration', async () => {
    referralQueries.findWorkspaceByReferralCode.mockRejectedValueOnce(new Error('db down'))
    await expect(attachReferralOnSignup('referee', 'X')).resolves.toBeUndefined()
  })
})

describe('rewardReferralOnPayment', () => {
  const referral = { id: 'r1', referrer_workspace_id: 'referrer', referee_workspace_id: 'referee', status: 'signed_up' as const }

  it('does nothing when there is no referral, or it is past signed_up', async () => {
    referralQueries.findReferralByReferee.mockResolvedValueOnce(null)
    await rewardReferralOnPayment('referee', 'pay1')
    referralQueries.findReferralByReferee.mockResolvedValueOnce({ ...referral, status: 'rewarded' })
    await rewardReferralOnPayment('referee', 'pay1')
    expect(referralQueries.markReferralPaid).not.toHaveBeenCalled()
  })

  it('marks paid, then rewards the referrer under the yearly cap', async () => {
    referralQueries.findReferralByReferee.mockResolvedValueOnce(referral)
    referralQueries.countRewardedSince.mockResolvedValueOnce(REFERRAL_MAX_REWARDS_PER_YEAR - 1)
    billingQueries.getWorkspaceBilling.mockResolvedValueOnce({ id: 'referrer', plan_tier: 'free', plan_source: 'paid', plan_expires_at: null })
    await rewardReferralOnPayment('referee', 'pay1')
    expect(referralQueries.markReferralPaid).toHaveBeenCalledWith('r1', 'pay1')
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('UPDATE workspaces'), expect.arrayContaining(['referrer', 'pro', expect.any(Date), 'granted']))
    expect(referralQueries.markReferralRewarded).toHaveBeenCalledWith('r1', REFERRAL_REFERRER_REWARD_DAYS)
  })

  it('caps at the yearly limit and marks the referral capped, not rewarded', async () => {
    referralQueries.findReferralByReferee.mockResolvedValueOnce(referral)
    referralQueries.countRewardedSince.mockResolvedValueOnce(REFERRAL_MAX_REWARDS_PER_YEAR)
    await rewardReferralOnPayment('referee', 'pay1')
    expect(referralQueries.markReferralCapped).toHaveBeenCalledWith('r1')
    expect(referralQueries.markReferralRewarded).not.toHaveBeenCalled()
    expect(billingQueries.getWorkspaceBilling).not.toHaveBeenCalled()
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
