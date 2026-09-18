import { pool } from '../connection'
import type { Feature } from '../../services/llm/types'

export interface CreateUsageLogParams {
  userId?:      string
  workspaceId?: string
  feature:      Feature
  variant?:     string
  model:        string      // 'deepseek:deepseek-flash'
  account?:     string      // which provider account served the call
  inputTokens:  number
  outputTokens: number
  costUsd:      number
  durationMs:   number
  success:      boolean
  errorCode?:   string      // 'TRUNCATED' | 'HTTP_429' | …
}

/**
 * One row per model call. Fire-and-forget — never await this where it would
 * block a user-facing response. Written by the provider adapters, never by
 * callers (see migration 003).
 */
export async function createUsageLog(p: CreateUsageLogParams): Promise<void> {
  await pool.query(
    `INSERT INTO usage_log
       (user_id, workspace_id, feature, variant, model, account,
        input_tokens, output_tokens, cost_usd, duration_ms, success, error_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      p.userId ?? null, p.workspaceId ?? null, p.feature, p.variant ?? null, p.model, p.account ?? null,
      p.inputTokens, p.outputTokens, p.costUsd, p.durationMs, p.success, p.errorCode ?? null,
    ],
  )
}

/** Calls of one feature by this workspace since local midnight UTC —
 *  the per-day quota on editor turns. Counts failures too: a failed call
 *  still cost a request, and a client retrying into a wall must hit it. */
export async function countFeatureCallsToday(workspaceId: string, feature: Feature): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM usage_log
      WHERE workspace_id = $1 AND feature = $2 AND created_at >= date_trunc('day', NOW())`,
    [workspaceId, feature],
  )
  return Number(rows[0]?.n ?? 0)
}

/** Platform-wide calls of one feature today — the ceiling on the open
 *  landing endpoint, which has no workspace to count against. */
export async function countFeatureCallsTodayGlobal(feature: Feature): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM usage_log WHERE feature = $1 AND created_at >= date_trunc('day', NOW())`,
    [feature],
  )
  return Number(rows[0]?.n ?? 0)
}
