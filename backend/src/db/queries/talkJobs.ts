import { pool } from '../connection'
import type { TalkJobStatus, OutlineSlide, Slide } from '../../../../shared/types'
import type { GenerateParams } from '../../services/talks'

export interface TalkJobRow {
  id:            string
  talk_id:       string | null
  workspace_id:  string
  user_id:       string
  status:        TalkJobStatus
  // Stored server-side so the confirm request carries only the edited
  // outline — the client cannot swap the brief between the two halves of
  // one generation.
  request:       GenerateParams
  kind:          'generate' | 'rewrite'
  proposal:      Slide[] | null
  outline:       OutlineSlide[] | null
  error_message: string | null
  attempts:      number
  created_at:    string
  updated_at:    string
}

export async function createTalkJob(params: GenerateParams): Promise<TalkJobRow> {
  const { rows } = await pool.query<TalkJobRow>(
    `INSERT INTO talk_jobs (workspace_id, user_id, request) VALUES ($1, $2, $3) RETURNING *`,
    [params.workspaceId, params.userId, JSON.stringify(params)],
  )
  return rows[0]
}

export interface RewriteRequest { talkId: string; instruction: string; userId: string; workspaceId: string }

export async function createRewriteJob(req: RewriteRequest): Promise<TalkJobRow> {
  const { rows } = await pool.query<TalkJobRow>(
    `INSERT INTO talk_jobs (workspace_id, user_id, talk_id, kind, request) VALUES ($1, $2, $3, 'rewrite', $4) RETURNING *`,
    [req.workspaceId, req.userId, req.talkId, JSON.stringify(req)],
  )
  return rows[0]
}

export async function completeRewriteJob(id: string, proposal: Slide[]): Promise<void> {
  await pool.query(`UPDATE talk_jobs SET status = 'ready', proposal = $2, updated_at = NOW() WHERE id = $1`, [id, JSON.stringify(proposal)])
}

/** The proposal is consumed once: applied or dismissed, the row loses it. */
export async function clearRewriteProposal(id: string, workspaceId: string): Promise<void> {
  await pool.query(`UPDATE talk_jobs SET proposal = NULL, updated_at = NOW() WHERE id = $1 AND workspace_id = $2`, [id, workspaceId])
}

export async function getTalkJobById(id: string, workspaceId: string): Promise<TalkJobRow | null> {
  const { rows } = await pool.query<TalkJobRow>(`SELECT * FROM talk_jobs WHERE id = $1 AND workspace_id = $2`, [id, workspaceId])
  return rows[0] ?? null
}

// Worker-side lookup — the queue payload is built by our own route, so no
// workspace scoping. Route handlers must use getTalkJobById.
export async function getTalkJobByIdUnscoped(id: string): Promise<TalkJobRow | null> {
  const { rows } = await pool.query<TalkJobRow>(`SELECT * FROM talk_jobs WHERE id = $1`, [id])
  return rows[0] ?? null
}

export async function setTalkJobProcessing(id: string): Promise<void> {
  await pool.query(`UPDATE talk_jobs SET status = 'processing', attempts = attempts + 1, updated_at = NOW() WHERE id = $1`, [id])
}

export async function completeTalkJob(id: string, talkId: string): Promise<void> {
  await pool.query(`UPDATE talk_jobs SET status = 'ready', talk_id = $2, updated_at = NOW() WHERE id = $1`, [id, talkId])
}

/** `message` is USER-FACING copy — the UI prints it verbatim (CLAUDE.md §3.2). */
export async function failTalkJob(id: string, message: string): Promise<void> {
  await pool.query(`UPDATE talk_jobs SET status = 'failed', error_message = $2, updated_at = NOW() WHERE id = $1`, [id, message.slice(0, 500)])
}

/**
 * Hands the plan back to the user and parks the job. Guarded on the current
 * status so a retried worker attempt cannot resurrect a job the user has
 * already confirmed — the predicate is what makes the outline stage
 * idempotent.
 */
export async function setTalkJobOutlineReady(id: string, outline: OutlineSlide[]): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE talk_jobs SET status = 'outline_ready', outline = $2, updated_at = NOW()
      WHERE id = $1 AND status IN ('pending', 'processing')`,
    [id, JSON.stringify(outline)],
  )
  return (rowCount ?? 0) > 0
}

/**
 * User confirmed the plan (possibly edited). False when the job was no
 * longer waiting — a double-submitted «Продолжить», or an outline the sweep
 * expired — which the route turns into an error rather than a second
 * expansion. Conditional UPDATE, not read-then-write: two clicks racing
 * would otherwise mean two decks, two bills.
 */
export async function confirmTalkJobOutline(id: string, workspaceId: string, outline: OutlineSlide[]): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE talk_jobs SET status = 'processing', outline = $3, updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2 AND status = 'outline_ready'`,
    [id, workspaceId, JSON.stringify(outline)],
  )
  return (rowCount ?? 0) > 0
}

/**
 * Expires outlines nobody confirmed. Clears `request` too: it holds the
 * user's brief, and an abandoned draft is no reason to keep it.
 */
export async function expireStaleTalkOutlines(olderThanHours: number): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE talk_jobs
        SET status = 'failed',
            error_message = 'Черновик плана истёк — создайте выступление заново',
            request = '{}'::jsonb,
            updated_at = NOW()
      WHERE status = 'outline_ready'
        AND updated_at < NOW() - ($1 || ' hours')::interval`,
    [String(olderThanHours)],
  )
  return rowCount ?? 0
}
