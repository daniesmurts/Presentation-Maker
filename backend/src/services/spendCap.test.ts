import { describe, it, expect, vi, beforeEach } from 'vitest'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock('../db/connection', () => ({ pool: { query: queryMock } }))
vi.mock('../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { checkSpendCap, invalidateSpendCapCache } from './spendCap'
import { checkGlobalSpendCap, parseDailyCapUsd, GlobalSpendCapExceededError } from './globalSpendCap'
import { pickEffectiveCap, assertTalkQuota, assertDownloadQuota, quotaOf, PLAN_LIMITS } from '../lib/planTier'
import { SpendCapExceededError, PlanLimitError } from '../errors/AppError'

beforeEach(() => { queryMock.mockReset(); invalidateSpendCapCache() })

function workspace(tier: string, override: number | null, spend: number) {
  queryMock.mockImplementation(async (sql: string) =>
    sql.includes('FROM workspaces') ? { rows: [{ plan_tier: tier, monthly_spend_cap_usd: override }] } : { rows: [{ cost: spend }] })
}

describe('pickEffectiveCap', () => {
  it('an explicit override wins; otherwise the tier default; unknown tier → free', () => {
    expect(pickEffectiveCap(12, 'free')).toBe(12)
    expect(pickEffectiveCap(null, 'pro')).toBe(PLAN_LIMITS.pro.monthlySpendCapUsd)
    expect(pickEffectiveCap(null, 'enterprise')).toBe(PLAN_LIMITS.free.monthlySpendCapUsd)
  })
})

describe('checkSpendCap', () => {
  it('blocks a workspace at or over its cap with the user-facing error', async () => {
    workspace('free', null, PLAN_LIMITS.free.monthlySpendCapUsd)
    await expect(checkSpendCap('w1')).rejects.toBeInstanceOf(SpendCapExceededError)
  })
  it('allows a workspace under its cap, and honours an override', async () => {
    workspace('free', 100, 50)
    await expect(checkSpendCap('w1')).resolves.toBeUndefined()
  })
  it('fails OPEN on an infra error — a cap check must never be why generation breaks', async () => {
    queryMock.mockRejectedValue(new Error('db down'))
    await expect(checkSpendCap('w1')).resolves.toBeUndefined()
  })
  it('caches for a minute so the check is not two queries per model call', async () => {
    workspace('free', null, 0)
    await checkSpendCap('w1'); await checkSpendCap('w1')
    expect(queryMock).toHaveBeenCalledTimes(2)   // one cap lookup + one spend sum, once
  })
})

describe('global daily cap', () => {
  it('parses the env: unset, junk or non-positive → no cap', () => {
    expect(parseDailyCapUsd(undefined)).toBe(Infinity)
    expect(parseDailyCapUsd('abc')).toBe(Infinity)
    expect(parseDailyCapUsd('0')).toBe(Infinity)
    expect(parseDailyCapUsd('25')).toBe(25)
  })
  it('is a no-op when unset and blocks when today’s spend reaches the cap', async () => {
    delete process.env.GLOBAL_DAILY_SPEND_CAP_USD
    await expect(checkGlobalSpendCap()).resolves.toBeUndefined()
    expect(queryMock).not.toHaveBeenCalled()
    process.env.GLOBAL_DAILY_SPEND_CAP_USD = '5'
    queryMock.mockResolvedValue({ rows: [{ cost: 5 }] })
    await expect(checkGlobalSpendCap()).rejects.toBeInstanceOf(GlobalSpendCapExceededError)
    delete process.env.GLOBAL_DAILY_SPEND_CAP_USD
  })
})

describe('assertTalkQuota', () => {
  it('lets free create up to the limit and refuses the next with plural-correct copy', () => {
    expect(() => assertTalkQuota('free', PLAN_LIMITS.free.talksPerMonth - 1)).not.toThrow()
    expect(() => assertTalkQuota('free', PLAN_LIMITS.free.talksPerMonth)).toThrow(PlanLimitError)
    // Free is two a month (2026-09-15) — «2 выступления», the few-form.
    try { assertTalkQuota('free', 99) } catch (e) { expect((e as PlanLimitError).message).toContain('2 выступления') }
  })
  it('pro is unlimited', () => {
    expect(() => assertTalkQuota('pro', 10_000)).not.toThrow()
  })
})

describe('download quota', () => {
  it('with billing off there is no download limit — nothing to upgrade to', () => {
    // vitest runs with BILLING_ENABLED unset/0: the free downloads are unlimited.
    expect(PLAN_LIMITS.free.downloadsPerMonth.pptx).toBe(Infinity)
    expect(() => assertDownloadQuota('free', 'pptx', 1_000)).not.toThrow()
    expect(quotaOf('free', { talks: 1, pptx: 3, pdf: 0 }).pptx).toEqual({ used: 3, limit: null })
    expect(quotaOf('free', { talks: 1, pptx: 3, pdf: 0 }).talks).toEqual({ used: 1, limit: 2 })
  })
  it('pro is unlimited and reports null limits', () => {
    expect(() => assertDownloadQuota('pro', 'pdf', 10_000)).not.toThrow()
    expect(quotaOf('pro', { talks: 50, pptx: 50, pdf: 50 }).talks.limit).toBeNull()
  })
})
