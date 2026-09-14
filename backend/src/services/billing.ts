import { randomBytes } from 'node:crypto'
import { pool } from '../db/connection'
import { config } from '../lib/config'
import { logger } from '../lib/logger'
import { AppError, ValidationError } from '../errors/AppError'
import { PRO_PRICE_RUB } from '../lib/planTier'
import { recordTalkEvent } from '../db/queries/talkEvents'
import {
  getWorkspaceBilling, listPayments, findPaymentByOrderId, createPayment, setPaymentProviderId, markPaymentFailed,
  hasOpenPayment, hasRenewalAttemptSince, applyPaymentStatus, setAutoRenew, bumpRenewalFailures, listDueForRenewal, expireLapsedPro,
  type PaymentRow, type WorkspaceBilling,
} from '../db/queries/billing'
import * as tbank from './tbank/client'
import { verifyNotification } from './tbank/token'
import { scheduleWithLease } from './schedulerLease'

// The Pro subscription: 2 500 ₽ a month through T-Bank, auto-renewed from
// the card saved on the first payment (Recurrent=Y → RebillId → Charge).
//
// The flow, and where each step's truth lives:
//   checkout  → payments row (NEW) → T-Bank Init → the user pays on T-Bank's
//               hosted form → T-Bank POSTs a notification → applyNotification
//               sets CONFIRMED and gives the workspace a paid month.
//   renewal   → a leased job (CLAUDE.md §3.12) finds Pro workspaces whose
//               month ends within a day, Inits a new payment and Charges the
//               saved card; the notification confirms it like any other.
//   expiry    → a second leased job drops plan_tier to free GRACE_DAYS after
//               the paid month ended — never the webhook, never midnight.
//
// Idempotency: a notification is applied by (order_id, status); the same
// body twice extends the month once (applyPaymentStatus returns false). The
// GetState path the return page uses goes through the same function.

export const PRO_AMOUNT_KOPECKS = PRO_PRICE_RUB * 100
/** Days of Pro after the paid month ends before the tier drops — covers a
 *  webhook that lags and a card that needs a retry or two. */
export const GRACE_DAYS = 3
/** Consecutive Charge failures before auto-renew is switched off. */
export const MAX_RENEWAL_FAILURES = 3
/** Renewals are attempted this long before the month ends (the job runs
 *  every 6 h, so the first attempt lands ~a day early). */
const RENEW_AHEAD_HOURS = 24
/** A NEW payment younger than this blocks a second checkout — the user has
 *  a form open; two open forms mean two charges. */
const OPEN_PAYMENT_MINUTES = 30

const PAID = new Set(['CONFIRMED'])
const FAILED = new Set(['REJECTED', 'AUTH_FAIL', 'DEADLINE_EXPIRED', 'CANCELED', 'ATTEMPTS_EXPIRED'])
const REFUNDED = new Set(['REFUNDED', 'PARTIAL_REFUNDED'])

export interface BillingView {
  enabled:     boolean
  tier:        'free' | 'pro'
  price_rub:   number
  expires_at:  string | null
  auto_renew:  boolean
  card_last4:  string | null
  renewal_failures: number
  payments:    Array<Pick<PaymentRow, 'id' | 'kind' | 'amount_kopecks' | 'status' | 'created_at' | 'period_start' | 'period_end'>>
}

export async function billingView(workspaceId: string): Promise<BillingView> {
  const ws = await getWorkspaceBilling(workspaceId)
  const payments = config.billing.enabled ? await listPayments(workspaceId) : []
  return {
    enabled:    config.billing.enabled,
    tier:       ws?.plan_tier === 'pro' ? 'pro' : 'free',
    price_rub:  PRO_PRICE_RUB,
    expires_at: ws?.plan_expires_at?.toISOString() ?? null,
    auto_renew: ws?.auto_renew ?? false,
    card_last4: ws?.card_last4 ?? null,
    renewal_failures: ws?.renewal_failures ?? 0,
    payments:   payments.map((p) => ({ id: p.id, kind: p.kind, amount_kopecks: p.amount_kopecks, status: p.status, created_at: p.created_at, period_start: p.period_start, period_end: p.period_end })),
  }
}

function assertEnabled() {
  if (!config.billing.enabled) throw new AppError('Оплата в этой установке не подключена', 404, 'PLAN_BILLING_OFF')
  return config.billing.tbank
}

/** ≤50 chars, unique, and readable in T-Bank's cabinet: ws-<8 of id>-<kind>-<ts36>-<rand>. */
function newOrderId(workspaceId: string, kind: 'initial' | 'renewal'): string {
  return `ws-${workspaceId.slice(0, 8)}-${kind === 'initial' ? 'i' : 'r'}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
}

function urls(t: { publicUrl: string }) {
  return {
    successUrl:      `${config.frontendUrl}/billing?result=success&order=`,   // T-Bank does not append params; we look it up by the open payment
    failUrl:         `${config.frontendUrl}/billing?result=fail`,
    notificationUrl: `${t.publicUrl}/api/billing/tbank/notify`,
  }
}

/** The month a CONFIRMED payment buys: from the later of now and the current expiry. */
export function nextPeriod(currentExpiry: Date | null, now = new Date()): { start: Date; end: Date } {
  const start = currentExpiry && currentExpiry > now ? currentExpiry : now
  const end = new Date(start)
  // Calendar month, clamped: Jan 31 + 1 month → Feb 28/29, not Mar 3.
  const day = end.getUTCDate()
  end.setUTCDate(1)
  end.setUTCMonth(end.getUTCMonth() + 1)
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()
  end.setUTCDate(Math.min(day, lastDay))
  return { start, end }
}

// ─── Checkout ───────────────────────────────────────────────────────────────

export async function startCheckout(workspaceId: string, email: string): Promise<{ url: string; order_id: string }> {
  const t = assertEnabled()
  const ws = await getWorkspaceBilling(workspaceId)
  if (!ws) throw new AppError('Рабочее пространство не найдено', 404, 'NOT_FOUND')
  if (ws.plan_tier === 'pro' && ws.plan_expires_at && ws.plan_expires_at > new Date() && ws.tbank_rebill_id && ws.auto_renew) {
    throw new ValidationError('Тариф Pro уже подключён и продлевается автоматически')
  }
  if (await hasOpenPayment(workspaceId, 'initial', OPEN_PAYMENT_MINUTES)) {
    throw new ValidationError('Предыдущая оплата ещё не завершена. Закончите её или подождите несколько минут.')
  }
  const row = await createPayment({ workspaceId, orderId: newOrderId(workspaceId, 'initial'), kind: 'initial', amountKopecks: PRO_AMOUNT_KOPECKS })
  const { successUrl, failUrl, notificationUrl } = urls(t)
  let result: tbank.InitResult
  try {
    result = await tbank.init({
      amountKopecks: PRO_AMOUNT_KOPECKS, orderId: row.order_id, description: `Тезариум Pro — 1 месяц`,
      customerKey: workspaceId, recurrent: true,
      successUrl: successUrl + row.order_id, failUrl, notificationUrl,
      receipt: tbank.subscriptionReceipt(email, PRO_AMOUNT_KOPECKS, 'Подписка Тезариум Pro, 1 месяц'),
    })
  } catch (err) {
    await markPaymentFailed(row.id, 'INIT_FAILED', err instanceof tbank.TbankError ? err.errorCode : null)
    throw err
  }
  await setPaymentProviderId(row.id, result.paymentId, result.status)
  logger.info({ message: 'Checkout started', workspaceId, orderId: row.order_id, paymentId: result.paymentId })
  return { url: result.paymentUrl, order_id: row.order_id }
}

// ─── Applying a payment outcome (webhook and GetState share this) ───────────

export interface Notification {
  TerminalKey?: string
  OrderId?:     string
  Success?:     boolean
  Status?:      string
  PaymentId?:   string | number
  ErrorCode?:   string
  Amount?:      number
  Pan?:         string
  RebillId?:    string | number
  Token?:       string
  [k: string]:  unknown
}

export class NotificationRejected extends Error {
  constructor(public readonly reason: 'bad_token' | 'unknown_order' | 'wrong_terminal') { super(reason) }
}

/**
 * Verify and apply one T-Bank notification. Returns the payment row (for
 * the log) or throws NotificationRejected; the route turns that into a
 * non-200 so T-Bank keeps retrying while we investigate.
 */
export async function applyNotification(body: Notification): Promise<{ orderId: string; applied: boolean }> {
  const t = assertEnabled()
  if (!verifyNotification(body, t.password)) throw new NotificationRejected('bad_token')
  if (body.TerminalKey !== t.terminalKey) throw new NotificationRejected('wrong_terminal')
  const orderId = typeof body.OrderId === 'string' ? body.OrderId : ''
  const payment = await findPaymentByOrderId(orderId)
  if (!payment) throw new NotificationRejected('unknown_order')
  const applied = await applyOutcome(payment, String(body.Status ?? ''), body.ErrorCode ?? null, body, {
    amount:   typeof body.Amount === 'number' ? body.Amount : null,
    rebillId: body.RebillId != null ? String(body.RebillId) : null,
    pan:      typeof body.Pan === 'string' ? body.Pan : null,
  })
  return { orderId, applied }
}

async function applyOutcome(
  payment: PaymentRow, status: string, errorCode: string | null, raw: unknown,
  extra: { amount: number | null; rebillId: string | null; pan: string | null },
): Promise<boolean> {
  if (!status || payment.status === status) return false

  if (PAID.has(status)) {
    // A CONFIRMED for less than the price is not a paid month; log it loudly and leave the row.
    if (extra.amount != null && extra.amount !== payment.amount_kopecks) {
      logger.error({ message: 'Payment confirmed for a different amount', orderId: payment.order_id, expected: payment.amount_kopecks, got: extra.amount })
      return false
    }
    const ws = await getWorkspaceBilling(payment.workspace_id)
    const { start, end } = nextPeriod(ws?.plan_expires_at ?? null)
    const applied = await applyPaymentStatus(payment.id, status, null, raw, {
      workspaceId: payment.workspace_id, periodStart: start, periodEnd: end,
      rebillId: extra.rebillId, cardLast4: extra.pan ? extra.pan.slice(-4) : null,
    })
    if (applied) {
      recordTalkEvent({ talkId: null, workspaceId: payment.workspace_id, userId: null, event: payment.kind === 'initial' ? 'subscribed' : 'renewed', metadata: { amount_kopecks: payment.amount_kopecks, kind: payment.kind, order_id: payment.order_id } })
      logger.info({ message: 'Payment confirmed', orderId: payment.order_id, kind: payment.kind, workspaceId: payment.workspace_id, until: end.toISOString() })
    }
    return applied
  }

  if (FAILED.has(status)) {
    const applied = await applyPaymentStatus(payment.id, status, errorCode, raw, null)
    if (applied) {
      recordTalkEvent({ talkId: null, workspaceId: payment.workspace_id, userId: null, event: 'payment_failed', metadata: { amount_kopecks: payment.amount_kopecks, kind: payment.kind, order_id: payment.order_id, status, error_code: errorCode } })
      if (payment.kind === 'renewal') await noteRenewalFailure(payment.workspace_id, payment.order_id)
    }
    return applied
  }

  if (REFUNDED.has(status)) {
    // Refunds are done by the operator in T-Bank's cabinet; we record and
    // do not claw the month back automatically — that is a support decision.
    logger.warn({ message: 'Payment refunded', orderId: payment.order_id, status })
    return applyPaymentStatus(payment.id, status, errorCode, raw, null)
  }

  // Intermediate (FORM_SHOWED, AUTHORIZED, …): keep the latest for the page.
  return applyPaymentStatus(payment.id, status, errorCode, raw, null)
}

/** The return page asks: did my order go through? Polls T-Bank once and applies the answer. */
export async function verifyOrder(workspaceId: string, orderId: string): Promise<{ status: string; paid: boolean }> {
  assertEnabled()
  const payment = await findPaymentByOrderId(orderId)
  if (!payment || payment.workspace_id !== workspaceId) throw new AppError('Платёж не найден', 404, 'NOT_FOUND')
  if (payment.tbank_payment_id && !PAID.has(payment.status) && !FAILED.has(payment.status)) {
    try {
      const state = await tbank.getState(payment.tbank_payment_id)
      await applyOutcome(payment, state.status, null, { source: 'GetState', ...state }, { amount: state.amountKopecks || null, rebillId: null, pan: null })
    } catch (err) {
      // The webhook will still arrive; the page just cannot say «оплачено» yet.
      logger.warn({ message: 'GetState failed on verify', orderId, error: (err as Error).message })
    }
  }
  const fresh = await findPaymentByOrderId(orderId)
  return { status: fresh?.status ?? payment.status, paid: PAID.has(fresh?.status ?? '') }
}

// ─── Auto-renew ─────────────────────────────────────────────────────────────

export async function setAutoRenewFor(workspaceId: string, userId: string, on: boolean): Promise<void> {
  assertEnabled()
  const ws = await getWorkspaceBilling(workspaceId)
  if (!ws) throw new AppError('Рабочее пространство не найдено', 404, 'NOT_FOUND')
  if (on && !ws.tbank_rebill_id) throw new ValidationError('Нет сохранённой карты — оплатите тариф заново, карта сохранится')
  await setAutoRenew(workspaceId, on)
  recordTalkEvent({ talkId: null, workspaceId, userId, event: on ? 'auto_renew_on' : 'auto_renew_off' })
}

async function noteRenewalFailure(workspaceId: string, orderId: string): Promise<void> {
  const failures = await bumpRenewalFailures(workspaceId, MAX_RENEWAL_FAILURES)
  recordTalkEvent({ talkId: null, workspaceId, userId: null, event: 'renewal_failed', metadata: { order_id: orderId, failures } })
  logger.warn({ message: 'Renewal failed', workspaceId, orderId, failures, autoRenewOff: failures >= MAX_RENEWAL_FAILURES })
}

/** One renewal attempt for one workspace: Init (no Recurrent) + Charge with the saved card. */
export async function renewWorkspace(ws: WorkspaceBilling, email: string): Promise<void> {
  const t = assertEnabled()
  if (!ws.tbank_rebill_id) return
  if (await hasRenewalAttemptSince(ws.id, 24)) return   // one attempt a day, whatever the tick; MAX_RENEWAL_FAILURES days ≈ GRACE_DAYS
  const row = await createPayment({ workspaceId: ws.id, orderId: newOrderId(ws.id, 'renewal'), kind: 'renewal', amountKopecks: PRO_AMOUNT_KOPECKS })
  const { successUrl, failUrl, notificationUrl } = urls(t)
  try {
    const init = await tbank.init({
      amountKopecks: PRO_AMOUNT_KOPECKS, orderId: row.order_id, description: 'Тезариум Pro — продление на 1 месяц',
      customerKey: ws.id, successUrl: successUrl + row.order_id, failUrl, notificationUrl,
      receipt: tbank.subscriptionReceipt(email, PRO_AMOUNT_KOPECKS, 'Подписка Тезариум Pro, 1 месяц'),
    })
    await setPaymentProviderId(row.id, init.paymentId, init.status)
    const charged = await tbank.charge(init.paymentId, ws.tbank_rebill_id)
    // Charge answers with the final status synchronously; the notification
    // repeats it and is applied idempotently.
    if (charged.status) {
      await applyOutcome({ ...row, tbank_payment_id: init.paymentId, status: init.status }, charged.status, null, { source: 'Charge', ...charged }, { amount: null, rebillId: null, pan: null })
    }
  } catch (err) {
    const code = err instanceof tbank.TbankError ? err.errorCode : null
    await markPaymentFailed(row.id, 'REJECTED', code)
    await noteRenewalFailure(ws.id, row.order_id)
  }
}

export async function renewDue(): Promise<void> {
  const due = await listDueForRenewal(RENEW_AHEAD_HOURS)
  for (const ws of due) {
    const email = await ownerEmail(ws.id)
    if (!email) continue
    await renewWorkspace(ws, email)
  }
}

async function ownerEmail(workspaceId: string): Promise<string | null> {
  const { rows } = await pool.query<{ email: string }>(`SELECT email FROM users WHERE workspace_id = $1 ORDER BY created_at LIMIT 1`, [workspaceId])
  return rows[0]?.email ?? null
}

export async function expireLapsed(): Promise<void> {
  const n = await expireLapsedPro(GRACE_DAYS)
  if (n > 0) logger.info({ message: 'Pro expired after grace', workspaces: n })
}

/** Both jobs, leased (CLAUDE.md §3.12). No-op when billing is off. */
export function startBillingJobs(): void {
  if (!config.billing.enabled) return
  const sixHours = 6 * 60 * 60 * 1000
  scheduleWithLease('billing-renew', { intervalMs: sixHours, firstRunDelayMs: 60_000 }, renewDue)
  scheduleWithLease('billing-expire', { intervalMs: sixHours, firstRunDelayMs: 90_000 }, expireLapsed)
}
