import { pool } from '../connection'
import { logger } from '../../lib/logger'

export interface TalkEvent {
  talkId:      string | null   // null for workspace-level events (billing)
  workspaceId: string
  userId:      string | null
  // 'subscribed' | 'renewed' | 'payment_failed' | 'renewal_failed' carry
  // { amount_kopecks, kind, order_id } (CLAUDE.md §3.9 — record the shape).
  event:       'exported' | 'subscribed' | 'renewed' | 'payment_failed' | 'renewal_failed' | 'auto_renew_off' | 'auto_renew_on'
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
