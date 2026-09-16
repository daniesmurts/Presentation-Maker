import { pool } from '../connection'

export type PromoKind = 'percent' | 'fixed' | 'free_months'

export interface PromoCodeRow {
  id:          string
  code:        string
  kind:        PromoKind
  value:       number
  max_uses:    number | null
  valid_until: string | null
  active:      boolean
  created_by:  string | null
  created_at:  string
}

export async function findActivePromoByCode(code: string): Promise<PromoCodeRow | null> {
  const { rows } = await pool.query<PromoCodeRow>(`SELECT * FROM promo_codes WHERE code = $1 AND active`, [code.toUpperCase()])
  return rows[0] ?? null
}

export async function countRedemptions(promoCodeId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM promo_redemptions WHERE promo_code_id = $1`, [promoCodeId])
  return +rows[0].n
}

export async function hasWorkspaceRedeemed(promoCodeId: string, workspaceId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`SELECT 1 FROM promo_redemptions WHERE promo_code_id = $1 AND workspace_id = $2`, [promoCodeId, workspaceId])
  return (rowCount ?? 0) > 0
}

/** Idempotent on the (code, workspace) unique constraint — a retried notification never double-counts a use. */
export async function recordRedemption(r: { promoCodeId: string; workspaceId: string; paymentId: string | null; discountKopecks: number | null; monthsGranted: number | null }): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO promo_redemptions (promo_code_id, workspace_id, payment_id, discount_kopecks, months_granted)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (promo_code_id, workspace_id) DO NOTHING`,
    [r.promoCodeId, r.workspaceId, r.paymentId, r.discountKopecks, r.monthsGranted],
  )
  return (rowCount ?? 0) > 0
}

export interface CreatePromoInput { code: string; kind: PromoKind; value: number; maxUses: number | null; validUntil: string | null; createdBy: string }

export async function createPromoCode(p: CreatePromoInput): Promise<PromoCodeRow> {
  const { rows } = await pool.query<PromoCodeRow>(
    `INSERT INTO promo_codes (code, kind, value, max_uses, valid_until, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [p.code.toUpperCase(), p.kind, p.value, p.maxUses, p.validUntil, p.createdBy],
  )
  return rows[0]
}

export interface AdminPromoRow extends PromoCodeRow { redemptions: number; created_by_email: string | null }

export async function listPromoCodes(): Promise<AdminPromoRow[]> {
  const { rows } = await pool.query<AdminPromoRow & { redemptions: string }>(`
    SELECT p.*, u.email AS created_by_email,
           (SELECT COUNT(*) FROM promo_redemptions r WHERE r.promo_code_id = p.id)::text AS redemptions
      FROM promo_codes p LEFT JOIN users u ON u.id = p.created_by
     ORDER BY p.created_at DESC`)
  return rows.map((r) => ({ ...r, redemptions: +r.redemptions }))
}

export async function setPromoCodeActive(id: string, active: boolean): Promise<PromoCodeRow | null> {
  const { rows } = await pool.query<PromoCodeRow>(`UPDATE promo_codes SET active = $2 WHERE id = $1 RETURNING *`, [id, active])
  return rows[0] ?? null
}

export async function findPromoCodeById(id: string): Promise<PromoCodeRow | null> {
  const { rows } = await pool.query<PromoCodeRow>(`SELECT * FROM promo_codes WHERE id = $1`, [id])
  return rows[0] ?? null
}
