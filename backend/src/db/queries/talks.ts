import { pool } from '../connection'
import type { Talk, Slide, TalkSource } from '../../../../shared/types'
import type { GenerateParams } from '../../services/talks'

export async function createTalk(params: GenerateParams, slides: Slide[], sources: TalkSource[], slideTarget: number): Promise<Talk> {
  const { rows } = await pool.query<Talk>(
    `INSERT INTO talks
       (workspace_id, owner_id, title, brief, intent, audience, language,
        slide_count_target, duration_minutes, notes_enabled, strict_to_brief, slides, sources)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      params.workspaceId, params.userId, params.title, params.brief, params.intent, params.audience, params.language,
      slideTarget, params.durationMinutes, params.notesEnabled, params.strictToBrief,
      JSON.stringify(slides), JSON.stringify(sources),
    ],
  )
  return rows[0]
}

// Every read is workspace-scoped: a talk id from another workspace simply
// does not resolve.
export async function findTalkById(id: string, workspaceId: string): Promise<Talk | null> {
  const { rows } = await pool.query<Talk>(`SELECT * FROM talks WHERE id = $1 AND workspace_id = $2`, [id, workspaceId])
  return rows[0] ?? null
}

export interface TalkListRow {
  id:            string
  title:         string
  intent:        string
  audience:      string
  language:      string
  slide_count:   number
  created_at:    string
  updated_at:    string
}

export async function listTalks(workspaceId: string): Promise<TalkListRow[]> {
  const { rows } = await pool.query<TalkListRow>(
    `SELECT id, title, intent, audience, language,
            COALESCE(jsonb_array_length(slides), 0) AS slide_count,
            created_at, updated_at
       FROM talks
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      LIMIT 200`,
    [workspaceId],
  )
  return rows
}

export async function setTalkTheme(id: string, workspaceId: string, themeId: string): Promise<Talk | null> {
  const { rows } = await pool.query<Talk>(
    `UPDATE talks SET theme_id = $3, updated_at = NOW() WHERE id = $1 AND workspace_id = $2 RETURNING *`, [id, workspaceId, themeId],
  )
  return rows[0] ?? null
}

/** Edits are "replace the array" — slides are JSONB on the row. */
export async function replaceSlides(id: string, workspaceId: string, slides: Slide[]): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE talks SET slides = $3, updated_at = NOW() WHERE id = $1 AND workspace_id = $2`,
    [id, workspaceId, JSON.stringify(slides)],
  )
  return (rowCount ?? 0) > 0
}

/** Talks created this calendar month — the quota's unit (lib/planTier.ts). */
export async function countTalksThisMonth(workspaceId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM talks WHERE workspace_id = $1 AND created_at >= date_trunc('month', NOW())`, [workspaceId],
  )
  return Number(rows[0]?.n ?? 0)
}

export async function deleteTalk(id: string, workspaceId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM talks WHERE id = $1 AND workspace_id = $2`, [id, workspaceId])
  return (rowCount ?? 0) > 0
}

// ─── Sharing ────────────────────────────────────────────────────────────────

export async function setShareToken(id: string, workspaceId: string, token: string | null): Promise<Talk | null> {
  const { rows } = await pool.query<Talk>(
        // $3::text — node-pg sends parameters untyped, and `$3 IS NULL` inside the
    // CASE gave Postgres nothing to infer the type from ("could not determine
    // data type of parameter $3"); the same statement passes in psql only
    // because PREPARE there had explicit types.
    `UPDATE talks SET share_token = $3::text, shared_at = CASE WHEN $3::text IS NULL THEN NULL ELSE NOW() END, updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2 RETURNING *`, [id, workspaceId, token],
  )
  return rows[0] ?? null
}

/** Public read — by token only, no workspace: the token IS the credential. */
export async function findTalkByShareToken(token: string): Promise<Talk | null> {
  const { rows } = await pool.query<Talk>(`SELECT * FROM talks WHERE share_token = $1`, [token])
  return rows[0] ?? null
}
