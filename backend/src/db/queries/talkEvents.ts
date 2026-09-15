import { pool } from '../connection'
import { logger } from '../../lib/logger'

export interface TalkEvent {
  talkId:      string | null   // null for workspace-level events (billing)
  workspaceId: string
  userId:      string | null
  // 'subscribed' | 'renewed' | 'payment_failed' | 'renewal_failed' carry
  // { amount_kopecks, kind, order_id } (CLAUDE.md §3.9 — record the shape).
  // 'image_generated' carries { slide, type } for one picture and
  // { done, failed, of } for a whole-deck pass — a deck that got 8 pictures
  // is different evidence from one that got 1 (§3.9).
  event:       'exported' | 'subscribed' | 'renewed' | 'payment_failed' | 'renewal_failed' | 'refunded' | 'auto_renew_off' | 'auto_renew_on' | 'image_generated'
  format?:     'pptx' | 'pdf'
  metadata?:   Record<string, unknown>
}

/** Fire-and-forget: analytics must never fail a download. */
export function recordTalkEvent(e: TalkEvent): void {
  pool.query(
    `INSERT INTO talk_events (talk_id, workspace_id, user_id, event, format, metadata) VALUES ($1,$2,$3,$4,$5,$6)`,
    [e.talkId, e.workspaceId, e.userId, e.event, e.format ?? null, e.metadata ? JSON.stringify(e.metadata) : null],
  ).catch((err) => logger.warn({ message: 'Failed to record talk event', error: (err as Error).message }))
}

/** Exports of `format` from this workspace since the start of the calendar month — the download quota's count. */
export async function countDownloadsThisMonth(workspaceId: string, format: 'pptx' | 'pdf'): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM talk_events
      WHERE workspace_id = $1 AND event = 'exported' AND format = $2 AND created_at >= date_trunc('month', NOW())`,
    [workspaceId, format],
  )
  return Number(rows[0]?.n ?? 0)
}
