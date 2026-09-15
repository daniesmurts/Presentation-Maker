import { pool } from '../connection'

export interface BrandKitRow {
  workspace_id: string
  accent:       string | null
  name:         string | null
  logo_path:    string | null
  logo_mime:    string | null
  logo_width:   number | null
  logo_height:  number | null
  custom_theme: unknown | null      // a Theme JSON (shared/themes.ts), validated before it was written
  updated_at:   string
}

export async function getBrandKit(workspaceId: string): Promise<BrandKitRow | null> {
  const { rows } = await pool.query<BrandKitRow>(`SELECT * FROM brand_kits WHERE workspace_id = $1`, [workspaceId])
  return rows[0] ?? null
}

/**
 * Three states per field: undefined = leave alone, null = clear, string =
 * set. A COALESCE upsert cannot express "clear" — the first version kept
 * the old name on null, and a reset brand still printed «ООО «Пример»» on
 * the title slide (found by looking at the PDF, 2026-09-14). So each field
 * carries its own "touched" flag into the SQL.
 */
export async function upsertBrandKit(workspaceId: string, patch: { accent?: string | null; name?: string | null }): Promise<BrandKitRow> {
  const { rows } = await pool.query<BrandKitRow>(
    `INSERT INTO brand_kits (workspace_id, accent, name) VALUES ($1, $3, $5)
     ON CONFLICT (workspace_id) DO UPDATE
       SET accent = CASE WHEN $2 THEN $3 ELSE brand_kits.accent END,
           name   = CASE WHEN $4 THEN $5 ELSE brand_kits.name END,
           updated_at = NOW()
     RETURNING *`,
    [workspaceId, patch.accent !== undefined, patch.accent ?? null, patch.name !== undefined, patch.name ?? null],
  )
  return rows[0]
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

/** The workspace's custom theme (Design v3, L3) — a validated Theme JSON, or null to remove it. */
export async function setCustomTheme(workspaceId: string, theme: unknown | null): Promise<BrandKitRow> {
  const { rows } = await pool.query<BrandKitRow>(
    `INSERT INTO brand_kits (workspace_id, custom_theme) VALUES ($1, $2)
     ON CONFLICT (workspace_id) DO UPDATE SET custom_theme = $2, updated_at = NOW()
     RETURNING *`,
    [workspaceId, theme === null ? null : JSON.stringify(theme)],
  )
  return rows[0]
}
