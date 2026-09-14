import { pool } from '../connection'

export interface BrandKitRow {
  workspace_id: string
  accent:       string | null
  name:         string | null
  logo_path:    string | null
  logo_mime:    string | null
  logo_width:   number | null
  logo_height:  number | null
  updated_at:   string
}

export async function getBrandKit(workspaceId: string): Promise<BrandKitRow | null> {
  const { rows } = await pool.query<BrandKitRow>(`SELECT * FROM brand_kits WHERE workspace_id = $1`, [workspaceId])
  return rows[0] ?? null
}

export async function upsertBrandKit(workspaceId: string, patch: { accent?: string | null; name?: string | null }): Promise<BrandKitRow> {
  const { rows } = await pool.query<BrandKitRow>(
    `INSERT INTO brand_kits (workspace_id, accent, name) VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id) DO UPDATE
       SET accent = COALESCE($2, brand_kits.accent), name = COALESCE($3, brand_kits.name), updated_at = NOW()
     RETURNING *`,
    [workspaceId, patch.accent === undefined ? null : patch.accent, patch.name === undefined ? null : patch.name],
  )
  return rows[0]
}

export async function clearBrandAccent(workspaceId: string): Promise<void> {
  await pool.query(`UPDATE brand_kits SET accent = NULL, updated_at = NOW() WHERE workspace_id = $1`, [workspaceId])
}

export async function setBrandLogo(workspaceId: string, logo: { path: string; mime: string; width: number; height: number } | null): Promise<BrandKitRow> {
  const { rows } = await pool.query<BrandKitRow>(
    `INSERT INTO brand_kits (workspace_id, logo_path, logo_mime, logo_width, logo_height) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id) DO UPDATE
       SET logo_path = $2, logo_mime = $3, logo_width = $4, logo_height = $5, updated_at = NOW()
     RETURNING *`,
    [workspaceId, logo?.path ?? null, logo?.mime ?? null, logo?.width ?? null, logo?.height ?? null],
  )
  return rows[0]
}
