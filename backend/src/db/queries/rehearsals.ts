import { pool } from '../connection'
import type { Rehearsal, RehearsalMetrics, RehearsalReview, RehearsalSegment, RehearsalVisit } from '../../../../shared/types'

// Workspace-scoped like talks: a rehearsal id from another workspace does
// not resolve. The row is written once; the review lands later.

export async function createRehearsal(p: {
  talkId: string; workspaceId: string; userId: string; startedAt: Date; durationMs: number
  speechAvailable: boolean; segments: RehearsalSegment[]; visits: RehearsalVisit[]; metrics: RehearsalMetrics
}): Promise<Rehearsal> {
  const { rows } = await pool.query<Rehearsal>(
    `INSERT INTO rehearsals (talk_id, workspace_id, user_id, started_at, duration_ms, speech_available, segments, visits, metrics)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [p.talkId, p.workspaceId, p.userId, p.startedAt, p.durationMs, p.speechAvailable, JSON.stringify(p.segments), JSON.stringify(p.visits), JSON.stringify(p.metrics)],
  )
  return rows[0]
}

export async function findRehearsalById(id: string, workspaceId: string): Promise<Rehearsal | null> {
  const { rows } = await pool.query<Rehearsal>(`SELECT * FROM rehearsals WHERE id = $1 AND workspace_id = $2`, [id, workspaceId])
  return rows[0] ?? null
}

export interface RehearsalListRow {
  id: string; started_at: string; duration_ms: number; speech_available: boolean
  review_status: Rehearsal['review_status']; words: number; fillers: number
  // Enough of the metrics to compare one run with the previous one
  // (shared/rehearsalProgress.ts) without loading the rows.
  target_ms: number | null; words_per_min: number | null; over_slides: number
}

/** Newest first — the report page's «earlier rehearsals» list and the
 *  N-vs-N−1 comparison. */
export async function listRehearsals(talkId: string, workspaceId: string): Promise<RehearsalListRow[]> {
  const { rows } = await pool.query<RehearsalListRow>(
    `SELECT id, started_at, duration_ms, speech_available, review_status,
            (metrics->>'words')::int AS words, (metrics->>'fillers')::int AS fillers,
            (metrics->>'target_ms')::int AS target_ms, (metrics->>'words_per_min')::int AS words_per_min,
            (SELECT COUNT(*)::int FROM jsonb_array_elements(metrics->'slides') s WHERE (s->>'over')::boolean) AS over_slides
       FROM rehearsals WHERE talk_id = $1 AND workspace_id = $2 ORDER BY created_at DESC LIMIT 20`,
    [talkId, workspaceId],
  )
  return rows
}

export async function saveRehearsalReview(id: string, workspaceId: string, review: RehearsalReview | null, status: Rehearsal['review_status']): Promise<Rehearsal | null> {
  const { rows } = await pool.query<Rehearsal>(
    `UPDATE rehearsals SET review = $3, review_status = $4 WHERE id = $1 AND workspace_id = $2 RETURNING *`,
    [id, workspaceId, review ? JSON.stringify(review) : null, status],
  )
  return rows[0] ?? null
}

/** Reviews completed this calendar month — the free tier's quota. */
export async function countReviewsThisMonth(workspaceId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM rehearsals
      WHERE workspace_id = $1 AND review_status = 'ready' AND created_at >= date_trunc('month', NOW())`,
    [workspaceId],
  )
  return Number(rows[0]?.n ?? 0)
}

export async function deleteRehearsal(id: string, workspaceId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM rehearsals WHERE id = $1 AND workspace_id = $2`, [id, workspaceId])
  return (rowCount ?? 0) > 0
}
