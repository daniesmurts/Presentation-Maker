import { pool } from '../connection'
import type { Draft, DraftCard, DraftMessage } from '../../../../shared/types'

// Every read is workspace-scoped, like talks: a draft id from another
// workspace does not resolve. Writes replace the JSONB whole — the service
// owns the arrays, the row is a snapshot.

export async function createDraft(workspaceId: string, ownerId: string, card: DraftCard): Promise<Draft> {
  const { rows } = await pool.query<Draft>(
    `INSERT INTO drafts (workspace_id, owner_id, title, card) VALUES ($1, $2, $3, $4) RETURNING *`,
    [workspaceId, ownerId, card.title, JSON.stringify(card)],
  )
  return rows[0]
}

export async function findDraftById(id: string, workspaceId: string): Promise<Draft | null> {
  const { rows } = await pool.query<Draft>(`SELECT * FROM drafts WHERE id = $1 AND workspace_id = $2`, [id, workspaceId])
  return rows[0] ?? null
}

export interface DraftListRow {
  id: string; title: string; message_count: number
  job_id: string | null
  talk_id: string | null    // resolved through the job: null until expansion completed
  created_at: string; updated_at: string
}

export async function listDrafts(workspaceId: string): Promise<DraftListRow[]> {
  const { rows } = await pool.query<DraftListRow>(
    `SELECT d.id, d.title, jsonb_array_length(d.messages) AS message_count, d.job_id, j.talk_id,
            d.created_at, d.updated_at
       FROM drafts d LEFT JOIN talk_jobs j ON j.id = d.job_id
      WHERE d.workspace_id = $1 ORDER BY d.updated_at DESC`,
    [workspaceId],
  )
  return rows
}

/** The one write: messages and card together, so a reply and the card it
 *  produced never land separately. `title` mirrors card.title for the list. */
export async function saveDraft(id: string, workspaceId: string, messages: DraftMessage[], card: DraftCard): Promise<Draft | null> {
  const { rows } = await pool.query<Draft>(
    `UPDATE drafts SET messages = $3, card = $4, title = $5, updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2 RETURNING *`,
    [id, workspaceId, JSON.stringify(messages), JSON.stringify(card), card.title],
  )
  return rows[0] ?? null
}

export async function setDraftJob(id: string, workspaceId: string, jobId: string): Promise<void> {
  await pool.query(`UPDATE drafts SET job_id = $3, updated_at = NOW() WHERE id = $1 AND workspace_id = $2`, [id, workspaceId, jobId])
}

export async function deleteDraft(id: string, workspaceId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM drafts WHERE id = $1 AND workspace_id = $2`, [id, workspaceId])
  return (rowCount ?? 0) > 0
}
