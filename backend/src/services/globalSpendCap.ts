import { pool } from '../db/connection'
import { AppError } from '../errors/AppError'
import { logger } from '../lib/logger'

// Platform-wide daily backstop, distinct from the per-workspace monthly cap:
// a burst of concurrent generations racks up real cost even when every
// workspace is under its own cap. Blunt, not billing. Disabled until an
// operator sets GLOBAL_DAILY_SPEND_CAP_USD for their infrastructure.

export class GlobalSpendCapExceededError extends AppError {
  constructor() {
    super('Временная перегрузка: сервис достиг дневного лимита расходов на генерацию. Попробуйте через несколько минут.', 503, 'GLOBAL_SPEND_CAP_EXCEEDED')
  }
}

/** Pure parsing rule: unset / non-positive / non-numeric → no cap. */
export function parseDailyCapUsd(raw: string | undefined): number {
  if (!raw) return Infinity
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : Infinity
}

let cache: { spendUsd: number; at: number } | null = null
const TTL_MS = 60 * 1000

export async function checkGlobalSpendCap(): Promise<void> {
  const cap = parseDailyCapUsd(process.env.GLOBAL_DAILY_SPEND_CAP_USD)
  if (cap === Infinity) return
  try {
    if (!cache || Date.now() - cache.at >= TTL_MS) {
      const { rows } = await pool.query<{ cost: number }>(`SELECT COALESCE(SUM(cost_usd), 0) AS cost FROM usage_log WHERE created_at >= date_trunc('day', NOW())`)
      cache = { spendUsd: Number(rows[0]?.cost ?? 0), at: Date.now() }
    }
    if (cache.spendUsd >= cap) throw new GlobalSpendCapExceededError()
  } catch (err) {
    if (err instanceof GlobalSpendCapExceededError) throw err
    logger.warn({ message: '[GlobalSpendCap] check failed, allowing call through', error: (err as Error).message })
  }
}
