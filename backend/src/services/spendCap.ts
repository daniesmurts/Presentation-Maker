import { pool } from '../db/connection'
import { pickEffectiveCap } from '../lib/planTier'
import { SpendCapExceededError } from '../errors/AppError'
import { logger } from '../lib/logger'

// Per-workspace monthly spend cap — a cost circuit breaker, not a plan gate.
// Enforced once, centrally, as a registry before-call hook, so every caller
// is covered whichever route or job triggered the call: one choke point
// beats N call sites that could each forget it.
//
// Fails OPEN on infra errors (DB down) — a cap check must never be the
// reason generation breaks. Fails CLOSED only when spend really is over.

interface Entry { capUsd: number; spendUsd: number; at: number }
const cache = new Map<string, Entry>()
const TTL_MS = 60 * 1000   // short — this gates real spend

async function resolveCap(workspaceId: string): Promise<number> {
  const { rows } = await pool.query<{ plan_tier: string; monthly_spend_cap_usd: number | null }>(
    `SELECT plan_tier, monthly_spend_cap_usd FROM workspaces WHERE id = $1`, [workspaceId],
  )
  const row = rows[0]
  return row ? pickEffectiveCap(row.monthly_spend_cap_usd, row.plan_tier) : pickEffectiveCap(null, 'free')
}

async function currentMonthSpend(workspaceId: string): Promise<number> {
  const { rows } = await pool.query<{ cost: number }>(
    `SELECT COALESCE(SUM(cost_usd), 0) AS cost FROM usage_log
      WHERE workspace_id = $1 AND created_at >= date_trunc('month', NOW())`, [workspaceId],
  )
  return Number(rows[0]?.cost ?? 0)
}

export async function checkSpendCap(workspaceId: string): Promise<void> {
  try {
    const cached = cache.get(workspaceId)
    let entry = cached && Date.now() - cached.at < TTL_MS ? cached : null
    if (!entry) {
      const [capUsd, spendUsd] = await Promise.all([resolveCap(workspaceId), currentMonthSpend(workspaceId)])
      entry = { capUsd, spendUsd, at: Date.now() }
      cache.set(workspaceId, entry)
    }
    if (entry.spendUsd >= entry.capUsd) throw new SpendCapExceededError(entry.capUsd)
  } catch (err) {
    if (err instanceof SpendCapExceededError) throw err
    logger.warn({ message: '[SpendCap] check failed, allowing call through', workspaceId, error: (err as Error).message })
  }
}

export function invalidateSpendCapCache(workspaceId?: string): void {
  if (workspaceId) cache.delete(workspaceId); else cache.clear()
}
