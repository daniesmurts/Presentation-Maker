import { pool } from '../connection'
import { logger } from '../../lib/logger'

export interface TalkEvent {
  talkId:      string
  workspaceId: string
  userId:      string
  event:       'exported'
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
