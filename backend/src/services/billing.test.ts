import { describe, it, expect, vi, beforeEach } from 'vitest'

// Billing on, with a known terminal — set before config is imported
// (imports are hoisted above plain statements; vi.hoisted runs first).
const { queryMock, tbankInit, tbankCharge, tbankGetState } = vi.hoisted(() => {
  process.env.BILLING_ENABLED     = '1'
  process.env.TBANK_TERMINAL_KEY  = 'TestTerminal'
  process.env.TBANK_PASSWORD      = 'test-password'
  process.env.PUBLIC_API_URL      = 'https://api.example.test'
  return { queryMock: vi.fn(), tbankInit: vi.fn(), tbankCharge: vi.fn(), tbankGetState: vi.fn() }
})
vi.mock('../db/connection', () => ({ pool: { query: queryMock, connect: async () => ({ query: queryMock, release: () => undefined }) } }))
vi.mock('../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./tbank/client', async (orig) => ({
  ...(await orig<typeof import('./tbank/client')>()),
  init: tbankInit, charge: tbankCharge, getState: tbankGetState,
}))

import { nextPeriod, applyNotification, NotificationRejected, startCheckout, renewWorkspace, PRO_AMOUNT_KOPECKS, MAX_RENEWAL_FAILURES } from './billing'
import { signRequest } from './tbank/token'
import { TbankError } from './tbank/client'

beforeEach(() => { queryMock.mockReset(); tbankInit.mockReset(); tbankCharge.mockReset(); tbankGetState.mockReset() })

describe('nextPeriod', () => {
  it('starts now for a free workspace and at the current expiry for an active one', () => {
    const now = new Date('2026-09-14T10:00:00Z')
    expect(nextPeriod(null, now)).toEqual({ start: now, end: new Date('2026-10-14T10:00:00Z') })
    const expiry = new Date('2026-09-30T10:00:00Z')
    expect(nextPeriod(expiry, now).start).toEqual(expiry)
    expect(nextPeriod(new Date('2026-09-01T00:00:00Z'), now).start).toEqual(now)   // lapsed → from now
  })
  it('clamps to the last day of a shorter month', () => {
    expect(nextPeriod(null, new Date('2027-01-31T12:00:00Z')).end).toEqual(new Date('2027-02-28T12:00:00Z'))
    expect(nextPeriod(null, new Date('2028-01-31T12:00:00Z')).end).toEqual(new Date('2028-02-29T12:00:00Z'))
    expect(nextPeriod(null, new Date('2026-12-15T12:00:00Z')).end).toEqual(new Date('2027-01-15T12:00:00Z'))
  })
})

// A notification body written by hand from the portal's field list — not
// produced by our own code (CLAUDE.md §9).
function confirmed(overrides: Record<string, unknown> = {}) {
  const body = {
    TerminalKey: 'TestTerminal', OrderId: 'ws-abcdef12-i-x1-aa', Success: true, Status: 'CONFIRMED',
    PaymentId: 900001, ErrorCode: '0', Amount: PRO_AMOUNT_KOPECKS, CardId: 5, Pan: '430000******0777', ExpDate: '1230', RebillId: 123456789,
    ...overrides,
  }
  return { ...body, Token: typeof overrides.Token === 'string' ? overrides.Token : signRequest(body, 'test-password') }
}

const paymentRow = { id: 'p1', workspace_id: 'w1', order_id: 'ws-abcdef12-i-x1-aa', tbank_payment_id: '900001', kind: 'initial', amount_kopecks: PRO_AMOUNT_KOPECKS, status: 'NEW', error_code: null, period_start: null, period_end: null, created_at: new Date(), updated_at: new Date() }

/** Routes the SQL the service issues to canned rows. */
function db(opts: { payment?: Record<string, unknown> | null; lockedStatus?: string; ws?: Record<string, unknown> }) {
  const writes: string[] = []
  queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM payments WHERE order_id')) return { rows: opts.payment === null ? [] : [opts.payment ?? paymentRow] }
    if (sql.includes('FOR UPDATE')) return { rows: [{ status: opts.lockedStatus ?? 'NEW' }] }
    if (sql.includes('FROM workspaces WHERE id')) return { rows: [{ id: 'w1', plan_tier: 'free', plan_expires_at: null, tbank_rebill_id: null, card_last4: null, auto_renew: true, renewal_failures: 0, ...opts.ws }] }
    if (sql.includes('INSERT INTO payments')) return { rows: [{ ...paymentRow, order_id: params?.[1] as string, kind: params?.[2] }] }
    if (sql.includes('SELECT 1 FROM payments')) return { rowCount: 0, rows: [] }   // no open / recent attempts
    if (sql.includes('renewal_failures + 1')) return { rows: [{ renewal_failures: 1 }] }
    writes.push(sql)
    return { rows: [], rowCount: 1 }
  })
  return writes
}

describe('applyNotification', () => {
  it('rejects a bad signature and a foreign terminal before touching the database', async () => {
    db({})
    await expect(applyNotification(confirmed({ Token: 'f'.repeat(64) }))).rejects.toMatchObject({ reason: 'bad_token' })
    await expect(applyNotification(confirmed({ TerminalKey: 'Other' }))).rejects.toMatchObject({ reason: 'wrong_terminal' })
    expect(queryMock).not.toHaveBeenCalled()
  })
  it('rejects an unknown order so T-Bank retries', async () => {
    db({ payment: null })
    await expect(applyNotification(confirmed())).rejects.toBeInstanceOf(NotificationRejected)
  })
  it('CONFIRMED gives the workspace a month of Pro, the card token and last4', async () => {
    const writes = db({})
    const r = await applyNotification(confirmed())
    expect(r.applied).toBe(true)
    const ws = writes.find((s) => s.includes("plan_tier = 'pro'"))
    expect(ws).toBeDefined()
    const call = queryMock.mock.calls.find(([sql]) => String(sql).includes("plan_tier = 'pro'"))!
    expect(call[1]).toEqual(['w1', expect.any(Date), '123456789', '0777'])
  })
  it('the same CONFIRMED twice extends once', async () => {
    db({ lockedStatus: 'CONFIRMED', payment: { ...paymentRow, status: 'CONFIRMED' } })
    const r = await applyNotification(confirmed())
    expect(r.applied).toBe(false)
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes("plan_tier = 'pro'"))).toBe(false)
  })
  it('a late AUTHORIZED never overwrites CONFIRMED (first live payment, 2026-09-15: the steps arrived out of order on two replicas)', async () => {
    const writes = db({ lockedStatus: 'CONFIRMED', payment: { ...paymentRow, status: 'CONFIRMED' } })
    const r = await applyNotification(confirmed({ Status: 'AUTHORIZED' }))
    expect(r.applied).toBe(false)
    expect(writes.some((s) => s.includes('UPDATE payments SET status'))).toBe(false)
  })
  it('an intermediate status still moves a NEW row along', async () => {
    const writes = db({})
    const r = await applyNotification(confirmed({ Status: 'AUTHORIZED' }))
    expect(r.applied).toBe(true)
    expect(writes.some((s) => s.includes('UPDATE payments SET status'))).toBe(true)
  })
  it('a full refund of the current period drops the tier and switches auto-renew off; a partial one only records', async () => {
    const paid = { ...paymentRow, status: 'CONFIRMED', period_start: new Date(), period_end: new Date(Date.now() + 20 * 86_400_000) }
    let writes = db({ lockedStatus: 'CONFIRMED', payment: paid })
    let r = await applyNotification(confirmed({ Status: 'REFUNDED' }))
    expect(r.applied).toBe(true)
    expect(writes.some((s) => s.includes("plan_tier = 'free'") && s.includes('auto_renew = FALSE'))).toBe(true)
    expect(queryMock.mock.calls.some(([sql, p]) => String(sql).includes('INSERT INTO talk_events') && (p as unknown[])[3] === 'refunded')).toBe(true)

    writes = db({ lockedStatus: 'CONFIRMED', payment: paid })
    r = await applyNotification(confirmed({ Status: 'PARTIAL_REFUNDED' }))
    expect(r.applied).toBe(true)
    expect(writes.some((s) => s.includes("plan_tier = 'free'"))).toBe(false)
  })
  it('a refund of an EARLIER period does not touch the tier', async () => {
    const old = { ...paymentRow, status: 'CONFIRMED', period_start: new Date(Date.now() - 60 * 86_400_000), period_end: new Date(Date.now() - 30 * 86_400_000) }
    const writes = db({ lockedStatus: 'CONFIRMED', payment: old })
    await applyNotification(confirmed({ Status: 'REFUNDED' }))
    expect(writes.some((s) => s.includes("plan_tier = 'free'"))).toBe(false)
  })
  it('a CONFIRMED for the wrong amount is logged and not applied', async () => {
    db({})
    const r = await applyNotification(confirmed({ Amount: 100 }))
    expect(r.applied).toBe(false)
  })
  it('REJECTED records the failure and leaves the tier alone', async () => {
    const writes = db({})
    const r = await applyNotification(confirmed({ Success: false, Status: 'REJECTED', ErrorCode: '1051', RebillId: undefined, Pan: undefined }))
    expect(r.applied).toBe(true)
    expect(writes.some((s) => s.includes("plan_tier = 'pro'"))).toBe(false)
    expect(queryMock.mock.calls.some(([sql, p]) => String(sql).includes('INSERT INTO talk_events') && (p as unknown[])[3] === 'payment_failed')).toBe(true)
  })
})

describe('startCheckout', () => {
  it('creates the row, signs Init with Recurrent and a receipt, returns the form URL', async () => {
    db({})
    tbankInit.mockResolvedValue({ paymentId: '900001', paymentUrl: 'https://securepay.tinkoff.ru/new/abc', status: 'NEW' })
    const r = await startCheckout('w1', 'user@example.test')
    expect(r.url).toBe('https://securepay.tinkoff.ru/new/abc')
    const params = tbankInit.mock.calls[0][0]
    expect(params).toMatchObject({ amountKopecks: 250000, recurrent: true, customerKey: 'w1', notificationUrl: 'https://api.example.test/api/billing/tbank/notify' })
    expect(params.receipt.Email).toBe('user@example.test')
    expect(params.receipt.Items[0]).toMatchObject({ Amount: 250000, Quantity: 1, PaymentObject: 'service' })
    expect(params.orderId.length).toBeLessThanOrEqual(50)
  })
  it('refuses a second checkout for an active auto-renewing Pro', async () => {
    db({ ws: { plan_tier: 'pro', plan_expires_at: new Date(Date.now() + 86400e3), tbank_rebill_id: 'r1' } })
    await expect(startCheckout('w1', 'u@x')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })
})

describe('renewWorkspace', () => {
  const ws = { id: 'w1', plan_tier: 'pro', plan_expires_at: new Date(), tbank_rebill_id: 'r1', card_last4: '0777', auto_renew: true, renewal_failures: 0 }
  it('Inits then Charges the saved card and applies the answer', async () => {
    const writes = db({})
    tbankInit.mockResolvedValue({ paymentId: '900002', paymentUrl: 'u', status: 'NEW' })
    tbankCharge.mockResolvedValue({ paymentId: '900002', status: 'CONFIRMED', errorCode: '0' })
    await renewWorkspace(ws, 'u@x')
    expect(tbankInit.mock.calls[0][0].recurrent).toBeUndefined()
    expect(tbankCharge).toHaveBeenCalledWith('900002', 'r1')
    expect(writes.some((s) => s.includes("plan_tier = 'pro'"))).toBe(true)
  })
  it('a declined Charge marks the payment and counts a failure', async () => {
    db({})
    tbankInit.mockResolvedValue({ paymentId: '900003', paymentUrl: 'u', status: 'NEW' })
    tbankCharge.mockRejectedValue(new TbankError('declined', '1051'))
    await renewWorkspace(ws, 'u@x')
    const bump = queryMock.mock.calls.find(([sql]) => String(sql).includes('renewal_failures + 1'))!
    expect(bump[1]).toEqual(['w1', MAX_RENEWAL_FAILURES])
    const failed = queryMock.mock.calls.find(([sql]) => String(sql).includes('error_code = $3') && !String(sql).includes('raw_notification'))!
    expect(failed[1]).toEqual(['p1', 'REJECTED', '1051'])
  })
})
