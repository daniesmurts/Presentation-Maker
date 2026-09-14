import { pool } from '../connection'

export interface TalkMediaRow {
  id:           string
  talk_id:      string
  workspace_id: string
  slide_index:  number
  storage_path: string
  mime:         string
  width:        number
  height:       number
  bytes:        number
  created_at:   string
}

export async function createTalkMedia(m: Omit<TalkMediaRow, 'id' | 'created_at'>): Promise<TalkMediaRow> {
  const { rows } = await pool.query<TalkMediaRow>(
    `INSERT INTO talk_media (talk_id, workspace_id, slide_index, storage_path, mime, width, height, bytes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [m.talk_id, m.workspace_id, m.slide_index, m.storage_path, m.mime, m.width, m.height, m.bytes],
  )
  return rows[0]
}

export async function getTalkMediaById(id: string): Promise<TalkMediaRow | null> {
  const { rows } = await pool.query<TalkMediaRow>(`SELECT * FROM talk_media WHERE id = $1`, [id])
  return rows[0] ?? null
}

export async function listTalkMediaPaths(talkId: string, workspaceId: string): Promise<string[]> {
  const { rows } = await pool.query<{ storage_path: string }>(`SELECT storage_path FROM talk_media WHERE talk_id = $1 AND workspace_id = $2`, [talkId, workspaceId])
  return rows.map((r) => r.storage_path)
}
