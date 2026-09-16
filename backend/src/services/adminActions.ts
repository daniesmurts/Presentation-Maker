import { pool } from '../db/connection'
import { recordTalkEvent } from '../db/queries/talkEvents'
import { NotFoundError, ValidationError } from '../errors/AppError'
import { logger } from '../lib/logger'

// The admin's writes (TODO M phase 2). Each one: read the row, change it,
// record admin_actions with the row before and after and the reason. Plan
// changes also land in talk_events next to `subscribed` / `renewed`, so a
// «did this workspace pay or was it given» question has one place to look.

export type AdminAction = 'grant_pro' | 'revoke_grant' | 'set_spend_cap' | 'deactivate_user' | 'reactivate_user' | 'support_answered' | 'support_reopened'

export interface Actor { adminId: string }

async function record(a: Actor, action: AdminAction, targetKind: 'workspace' | 'user' | 'support_message', targetId: string, before: unknown, after: unknown, reason: string | null): Promise<void> {
  await pool.query(
    `INSERT INTO admin_actions (admin_id, action, target_kind, target_id, before, after, reason) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [a.adminId, action, targetKind, targetId, JSON.stringify(before), JSON.stringify(after), reason],
  )
}

export function requireReason(raw: unknown): string {
  const reason = typeof raw === 'string' ? raw.trim() : ''
  if (reason.length < 3) throw new ValidationError('Укажите причину — она останется в журнале')
  return reason.slice(0, 500)
}

// ── Pro grants ──────────────────────────────────────────────────────────────

interface PlanRow { plan_tier: string; plan_expires_at: Date | null; plan_source: string }

export const GRANT_DAYS = [7, 14, 30, 90, 365] as const
export type GrantDays = typeof GRANT_DAYS[number]

/** What a grant of `days` does to a workspace. Pure — the rule, testable.
 *  A live paid Pro is extended and stays 'paid' (the card renews at the
 *  new date); anything else becomes a granted Pro from now, which the
 *  renew job never charges (db/queries/billing.ts listDueForRenewal). */
export function planGrant(ws: PlanRow, days: number, now = new Date()): PlanRow {
  const livePaid = ws.plan_tier === 'pro' && ws.plan_source === 'paid' && ws.plan_expires_at != null && ws.plan_expires_at > now
  const liveGrant = ws.plan_tier === 'pro' && ws.plan_source === 'granted' && ws.plan_expires_at != null && ws.plan_expires_at > now
  const from = livePaid || liveGrant ? ws.plan_expires_at! : now
  const expires = new Date(from.getTime() + days * 86_400_000)
  return { plan_tier: 'pro', plan_expires_at: expires, plan_source: livePaid ? 'paid' : 'granted' }
}

async function readPlan(workspaceId: string): Promise<PlanRow> {
  const { rows } = await pool.query<PlanRow>(`SELECT plan_tier, plan_expires_at, plan_source FROM workspaces WHERE id = $1`, [workspaceId])
  if (!rows[0]) throw new NotFoundError()
  return rows[0]
}

export async function grantPro(a: Actor, workspaceId: string, days: number, reason: string): Promise<PlanRow> {
  if (!(GRANT_DAYS as readonly number[]).includes(days)) throw new ValidationError('Срок: 7, 14, 30, 90 или 365 дней')
  const before = await readPlan(workspaceId)
  const after = planGrant(before, days)
  await pool.query(
    `UPDATE workspaces SET plan_tier = $2, plan_expires_at = $3, plan_source = $4, renewal_failures = 0 WHERE id = $1`,
    [workspaceId, after.plan_tier, after.plan_expires_at, after.plan_source],
  )
  await record(a, 'grant_pro', 'workspace', workspaceId, before, { ...after, days }, reason)
  recordTalkEvent({ talkId: null, workspaceId, userId: a.adminId, event: 'pro_granted', metadata: { days, until: after.plan_expires_at?.toISOString(), extended_paid: after.plan_source === 'paid' } })
  logger.info({ message: 'Pro granted', workspaceId, days, by: a.adminId, source: after.plan_source })
  return after
}

/** Ends a granted Pro now. A paid month is never revoked here — a refund
 *  in the T-Bank cabinet does that through the webhook. */
export async function revokeGrant(a: Actor, workspaceId: string, reason: string): Promise<PlanRow> {
  const before = await readPlan(workspaceId)
  if (before.plan_tier !== 'pro' || before.plan_source !== 'granted') throw new ValidationError('У этого пространства нет подаренного Pro — оплаченный месяц отзывается возвратом в кабинете Т-Банка')
  const after: PlanRow = { plan_tier: 'free', plan_expires_at: null, plan_source: 'paid' }
  await pool.query(`UPDATE workspaces SET plan_tier = 'free', plan_expires_at = NULL, plan_source = 'paid' WHERE id = $1`, [workspaceId])
  await record(a, 'revoke_grant', 'workspace', workspaceId, before, after, reason)
  recordTalkEvent({ talkId: null, workspaceId, userId: a.adminId, event: 'pro_grant_revoked', metadata: { was_until: before.plan_expires_at?.toISOString() } })
  return after
}

// ── Spend cap ───────────────────────────────────────────────────────────────

export async function setSpendCap(a: Actor, workspaceId: string, capUsd: number | null, reason: string): Promise<void> {
  if (capUsd != null && !(Number.isFinite(capUsd) && capUsd >= 0 && capUsd <= 10_000)) throw new ValidationError('Лимит: число от 0 до 10 000 $, или пусто — по тарифу')
  const { rows } = await pool.query<{ monthly_spend_cap_usd: string | null }>(`SELECT monthly_spend_cap_usd FROM workspaces WHERE id = $1`, [workspaceId])
  if (!rows[0]) throw new NotFoundError()
  await pool.query(`UPDATE workspaces SET monthly_spend_cap_usd = $2 WHERE id = $1`, [workspaceId, capUsd])
  await record(a, 'set_spend_cap', 'workspace', workspaceId, { cap_usd: rows[0].monthly_spend_cap_usd }, { cap_usd: capUsd }, reason)
}

// ── Users ───────────────────────────────────────────────────────────────────

interface UserRow { id: string; email: string; is_admin: boolean; deactivated_at: Date | null }

async function readUser(id: string): Promise<UserRow> {
  const { rows } = await pool.query<UserRow>(`SELECT id, email, is_admin, deactivated_at FROM users WHERE id = $1`, [id])
  if (!rows[0]) throw new NotFoundError()
  return rows[0]
}

export async function deactivateUser(a: Actor, userId: string, reason: string): Promise<void> {
  const before = await readUser(userId)
  if (before.id === a.adminId) throw new ValidationError('Себя отключить нельзя')
  if (before.is_admin) throw new ValidationError('Администраторы управляются через ADMIN_EMAILS, не отсюда')
  if (before.deactivated_at) throw new ValidationError('Уже отключён')
  const { rows } = await pool.query<{ deactivated_at: Date }>(`UPDATE users SET deactivated_at = NOW() WHERE id = $1 RETURNING deactivated_at`, [userId])
  await record(a, 'deactivate_user', 'user', userId, { email: before.email, deactivated_at: null }, { email: before.email, deactivated_at: rows[0].deactivated_at }, reason)
  logger.warn({ message: 'User deactivated', userId, by: a.adminId })
}

export async function reactivateUser(a: Actor, userId: string, reason: string): Promise<void> {
  const before = await readUser(userId)
  if (!before.deactivated_at) throw new ValidationError('Аккаунт и так активен')
  await pool.query(`UPDATE users SET deactivated_at = NULL WHERE id = $1`, [userId])
  await record(a, 'reactivate_user', 'user', userId, { email: before.email, deactivated_at: before.deactivated_at }, { email: before.email, deactivated_at: null }, reason)
}

// ── Support ─────────────────────────────────────────────────────────────────

export async function setSupportAnswered(a: Actor, messageId: string, answered: boolean): Promise<void> {
  const { rows } = await pool.query<{ answered_at: Date | null }>(`SELECT answered_at FROM support_messages WHERE id = $1`, [messageId])
  if (!rows[0]) throw new NotFoundError()
  const { rows: after } = await pool.query<{ answered_at: Date | null }>(
    `UPDATE support_messages SET answered_at = CASE WHEN $2 THEN NOW() ELSE NULL END, answered_by = CASE WHEN $2 THEN $3::uuid ELSE NULL END WHERE id = $1 RETURNING answered_at`,
    [messageId, answered, a.adminId],
  )
  await record(a, answered ? 'support_answered' : 'support_reopened', 'support_message', messageId, rows[0], after[0], null)
}

// ── The journal ─────────────────────────────────────────────────────────────

export interface AdminActionRow { id: string; admin_email: string | null; action: string; target_kind: string; target_id: string; before: unknown; after: unknown; reason: string | null; created_at: string }

export async function listActions(filter: { workspaceId?: string; limit?: number }): Promise<AdminActionRow[]> {
  const limit = Math.min(500, filter.limit ?? 100)
  const sql = `SELECT a.id, u.email AS admin_email, a.action, a.target_kind, a.target_id, a.before, a.after, a.reason, a.created_at
                 FROM admin_actions a LEFT JOIN users u ON u.id = a.admin_id`
  if (filter.workspaceId) {
    // A workspace's journal includes its users' and its own rows.
    const { rows } = await pool.query<AdminActionRow>(
      `${sql} WHERE (a.target_kind = 'workspace' AND a.target_id = $1)
                 OR (a.target_kind = 'user' AND a.target_id IN (SELECT id FROM users WHERE workspace_id = $1))
              ORDER BY a.created_at DESC LIMIT $2`, [filter.workspaceId, limit])
    return rows
  }
  const { rows } = await pool.query<AdminActionRow>(`${sql} ORDER BY a.created_at DESC LIMIT $1`, [limit])
  return rows
}
