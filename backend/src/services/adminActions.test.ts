import { describe, it, expect, vi, beforeEach } from 'vitest'

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }))
vi.mock('../db/connection', () => ({ pool: { query: queryMock } }))
vi.mock('../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { planGrant, grantPro, revokeGrant, deactivateUser, requireReason } from './adminActions'
import { ValidationError } from '../errors/AppError'

const now = new Date('2026-09-16T12:00:00Z')
const day = 86_400_000
const admin = { adminId: 'admin-1' }

beforeEach(() => queryMock.mockReset())

describe('planGrant — the rule', () => {
  it('a free workspace becomes a granted Pro from now', () => {
    const r = planGrant({ plan_tier: 'free', plan_expires_at: null, plan_source: 'paid' }, 30, now)
    expect(r).toEqual({ plan_tier: 'pro', plan_source: 'granted', plan_expires_at: new Date(now.getTime() + 30 * day) })
  })
  it('a live PAID Pro is extended and stays paid — the card renews at the new date', () => {
    const exp = new Date(now.getTime() + 10 * day)
    const r = planGrant({ plan_tier: 'pro', plan_expires_at: exp, plan_source: 'paid' }, 30, now)
    expect(r.plan_source).toBe('paid')
    expect(r.plan_expires_at).toEqual(new Date(exp.getTime() + 30 * day))
  })
  it('a lapsed paid Pro (expired, tier still pro in grace) becomes a grant from now, not from the old expiry', () => {
    const r = planGrant({ plan_tier: 'pro', plan_expires_at: new Date(now.getTime() - 2 * day), plan_source: 'paid' }, 7, now)
    expect(r.plan_source).toBe('granted')
    expect(r.plan_expires_at).toEqual(new Date(now.getTime() + 7 * day))
  })
  it('a live grant stacks', () => {
    const exp = new Date(now.getTime() + 5 * day)
    const r = planGrant({ plan_tier: 'pro', plan_expires_at: exp, plan_source: 'granted' }, 7, now)
    expect(r).toMatchObject({ plan_source: 'granted', plan_expires_at: new Date(exp.getTime() + 7 * day) })
  })
})

describe('grantPro', () => {
  it('rejects a duration off the list and records the action with before/after', async () => {
    await expect(grantPro(admin, 'ws', 11, 'because')).rejects.toThrow(ValidationError)
    queryMock
      .mockResolvedValueOnce({ rows: [{ plan_tier: 'free', plan_expires_at: null, plan_source: 'paid' }] })   // readPlan
      .mockResolvedValueOnce({ rows: [] })   // UPDATE
      .mockResolvedValueOnce({ rows: [] })   // admin_actions
      .mockResolvedValue({ rows: [] })       // talk_events
    const r = await grantPro(admin, 'ws', 30, 'partner')
    expect(r.plan_source).toBe('granted')
    const insert = queryMock.mock.calls.find((c) => String(c[0]).includes('INSERT INTO admin_actions'))!
    expect(insert[1]).toEqual(['admin-1', 'grant_pro', 'workspace', 'ws', expect.any(String), expect.any(String), 'partner'])
    expect(JSON.parse(insert[1][5])).toMatchObject({ days: 30, plan_source: 'granted' })
  })
})

describe('revokeGrant', () => {
  it('never revokes a paid month — that is a refund in the cabinet', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ plan_tier: 'pro', plan_expires_at: new Date(), plan_source: 'paid' }] })
    await expect(revokeGrant(admin, 'ws', 'oops')).rejects.toThrow(ValidationError)
  })
})

describe('deactivateUser', () => {
  it('refuses self, admins, and an already deactivated user', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'admin-1', email: 'a', is_admin: true, deactivated_at: null }] })
    await expect(deactivateUser(admin, 'admin-1', 'why')).rejects.toThrow('Себя')
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'u2', email: 'b', is_admin: true, deactivated_at: null }] })
    await expect(deactivateUser(admin, 'u2', 'why')).rejects.toThrow('ADMIN_EMAILS')
    queryMock.mockResolvedValueOnce({ rows: [{ id: 'u3', email: 'c', is_admin: false, deactivated_at: new Date() }] })
    await expect(deactivateUser(admin, 'u3', 'why')).rejects.toThrow('Уже')
  })
})

describe('requireReason', () => {
  it('needs three characters and caps at 500', () => {
    expect(() => requireReason('')).toThrow(ValidationError)
    expect(() => requireReason('ok')).toThrow(ValidationError)
    expect(requireReason('  spam  ')).toBe('spam')
    expect(requireReason('x'.repeat(600))).toHaveLength(500)
  })
})
