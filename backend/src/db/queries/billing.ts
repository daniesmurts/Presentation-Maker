import { pool } from '../connection'
import type { PoolClient } from 'pg'

// Billing rows (migration 012). Everything that flips plan_tier goes
// through services/billing.ts; this module is SQL only.

export interface WorkspaceBilling {
  id:               string
  plan_tier:        string
  plan_expires_at:  Date | null
  tbank_rebill_id:  string | null
  card_last4:       string | null
  auto_renew:       boolean
  renewal_failures: number
}

export interface PaymentRow {
  id:               string
  workspace_id:     string
  order_id:         string
  tbank_payment_id: string | null
  kind:             'initial' | 'renewal'
  amount_kopecks:   number
  status:           string
  error_code:       string | null
  period_start:     Date | null
  period_end:       Date | null
  created_at:       Date
  updated_at:       Date
}

const WS_COLS = 'id, plan_tier, plan_expires_at, tbank_rebill_id, card_last4, auto_renew, renewal_failures'

export async function getWorkspaceBilling(workspaceId: string): Promise<WorkspaceBilling | null> {
  const { rows } = await pool.query<WorkspaceBilling>(`SELECT ${WS_COLS} FROM workspaces WHERE id = $1`, [workspaceId])
  return rows[0] ?? null
}

export async function listPayments(workspaceId: string, limit = 12): Promise<PaymentRow[]> {
  const { rows } = await pool.query<PaymentRow>(
    `SELECT id, workspace_id, order_id, tbank_payment_id, kind, amount_kopecks, status, error_code, period_start, period_end, created_at, updated_at
       FROM payments WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [workspaceId, limit],
  )
  return rows
}

export async function findPaymentByOrderId(orderId: string): Promise<PaymentRow | null> {
  const { rows } = await pool.query<PaymentRow>(`SELECT * FROM payments WHERE order_id = $1`, [orderId])
  return rows[0] ?? null
}

export async function createPayment(p: { workspaceId: string; orderId: string; kind: 'initial' | 'renewal'; amountKopecks: number }): Promise<PaymentRow> {
  const { rows } = await pool.query<PaymentRow>(
    `INSERT INTO payments (workspace_id, order_id, kind, amount_kopecks) VALUES ($1, $2, $3, $4) RETURNING *`,
    [p.workspaceId, p.orderId, p.kind, p.amountKopecks],
  )
  return rows[0]
}

export async function setPaymentProviderId(id: string, tbankPaymentId: string, status: string): Promise<void> {
  await pool.query(`UPDATE payments SET tbank_payment_id = $2, status = $3, updated_at = NOW() WHERE id = $1`, [id, tbankPaymentId, status])
}

export async function markPaymentFailed(id: string, status: string, errorCode: string | null): Promise<void> {
  await pool.query(`UPDATE payments SET status = $2, error_code = $3, updated_at = NOW() WHERE id = $1`, [id, status, errorCode])
}

/** An initial/renewal payment still waiting on the form or the webhook. */
export async function hasOpenPayment(workspaceId: string, kind: 'initial' | 'renewal', withinMinutes: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM payments
      WHERE workspace_id = $1 AND kind = $2
        AND status IN ('NEW', 'FORM_SHOWED', 'AUTHORIZING', 'AUTHORIZED', 'CONFIRMING')
        AND created_at > NOW() - make_interval(mins => $3)
      LIMIT 1`,
    [workspaceId, kind, withinMinutes],
  )
  return (rowCount ?? 0) > 0
}

/** Any renewal Init in the window, whatever came of it — the job runs every
 *  6 h but a card is tried once a day. */
export async function hasRenewalAttemptSince(workspaceId: string, withinHours: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM payments WHERE workspace_id = $1 AND kind = 'renewal' AND created_at > NOW() - make_interval(hours => $2) LIMIT 1`,
    [workspaceId, withinHours],
  )
  return (rowCount ?? 0) > 0
}

/**
 * Apply a payment's terminal status in one transaction. `activate` carries
 * what a CONFIRMED payment buys; the caller has already decided the period.
 * Returns false when the row is already in that status (duplicate webhook).
 */
export async function applyPaymentStatus(
  paymentId: string,
  status: string,
  errorCode: string | null,
  raw: unknown,
  activate: { workspaceId: string; periodStart: Date; periodEnd: Date; rebillId: string | null; cardLast4: string | null } | null,
): Promise<boolean> {
  const client: PoolClient = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ status: string }>(`SELECT status FROM payments WHERE id = $1 FOR UPDATE`, [paymentId])
    if (!rows[0] || rows[0].status === status) { await client.query('ROLLBACK'); return false }
    await client.query(
      `UPDATE payments SET status = $2, error_code = $3, raw_notification = $4, updated_at = NOW(),
              period_start = COALESCE($5, period_start), period_end = COALESCE($6, period_end)
        WHERE id = $1`,
      [paymentId, status, errorCode, raw == null ? null : JSON.stringify(raw), activate?.periodStart ?? null, activate?.periodEnd ?? null],
    )
    if (activate) {
      await client.query(
        `UPDATE workspaces
            SET plan_tier = 'pro', plan_expires_at = $2, renewal_failures = 0, auto_renew = TRUE,
                tbank_rebill_id = COALESCE($3, tbank_rebill_id), card_last4 = COALESCE($4, card_last4)
          WHERE id = $1`,
        [activate.workspaceId, activate.periodEnd, activate.rebillId, activate.cardLast4],
      )
    }
    await client.query('COMMIT')
    return true
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function setAutoRenew(workspaceId: string, on: boolean): Promise<void> {
  await pool.query(`UPDATE workspaces SET auto_renew = $2 WHERE id = $1`, [workspaceId, on])
}

export async function bumpRenewalFailures(workspaceId: string, disableAfter: number): Promise<number> {
  const { rows } = await pool.query<{ renewal_failures: number }>(
    `UPDATE workspaces
        SET renewal_failures = renewal_failures + 1,
            auto_renew = CASE WHEN renewal_failures + 1 >= $2 THEN FALSE ELSE auto_renew END
      WHERE id = $1 RETURNING renewal_failures`,
    [workspaceId, disableAfter],
  )
  return rows[0]?.renewal_failures ?? 0
}

/** Pro workspaces whose paid month ends within `withinHours` and that have a card to charge. */
export async function listDueForRenewal(withinHours: number): Promise<WorkspaceBilling[]> {
  const { rows } = await pool.query<WorkspaceBilling>(
    `SELECT ${WS_COLS} FROM workspaces
      WHERE plan_tier = 'pro' AND auto_renew AND tbank_rebill_id IS NOT NULL
        AND plan_expires_at IS NOT NULL AND plan_expires_at < NOW() + make_interval(hours => $1)
      ORDER BY plan_expires_at`,
    [withinHours],
  )
  return rows
}

/** Pro workspaces whose paid month ended more than `graceDays` ago → free. Returns how many. */
/** A full refund of the current period: Pro ends now and the card is not
 *  charged again. Returns false when the workspace was not Pro. */
export async function revokePro(workspaceId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE workspaces SET plan_tier = 'free', plan_expires_at = NULL, auto_renew = FALSE WHERE id = $1 AND plan_tier = 'pro'`,
    [workspaceId],
  )
  return (rowCount ?? 0) > 0
}

export async function expireLapsedPro(graceDays: number): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE workspaces SET plan_tier = 'free'
      WHERE plan_tier = 'pro' AND plan_expires_at IS NOT NULL AND plan_expires_at < NOW() - make_interval(days => $1)`,
    [graceDays],
  )
  return rowCount ?? 0
}
