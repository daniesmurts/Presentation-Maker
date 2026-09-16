import { pool } from '../connection'

export interface ReferralRow {
  id:                    string
  referrer_workspace_id: string
  referee_workspace_id:  string
  status:                'signed_up' | 'paid' | 'rewarded' | 'capped' | 'clawed_back' | 'blocked'
  referee_payment_id:    string | null
  reward_days:           number | null
  flagged:               boolean
  flag_reason:           string | null
  created_at:            string
  paid_at:               string | null
  rewarded_at:           string | null
}

export async function getReferralCode(workspaceId: string): Promise<string | null> {
  const { rows } = await pool.query<{ referral_code: string | null }>(`SELECT referral_code FROM workspaces WHERE id = $1`, [workspaceId])
  return rows[0]?.referral_code ?? null
}

/** Claims a code atomically — the UNIQUE constraint is the source of truth; a collision just retries. */
export async function trySetReferralCode(workspaceId: string, code: string): Promise<boolean> {
  try {
    const { rowCount } = await pool.query(`UPDATE workspaces SET referral_code = $2 WHERE id = $1 AND referral_code IS NULL`, [workspaceId, code])
    return (rowCount ?? 0) > 0
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return false   // unique_violation — another workspace just took it
    throw err
  }
}

export async function findWorkspaceByReferralCode(code: string): Promise<{ id: string } | null> {
  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM workspaces WHERE referral_code = $1`, [code])
  return rows[0] ?? null
}

export async function getReferredBy(workspaceId: string): Promise<string | null> {
  const { rows } = await pool.query<{ referred_by_workspace_id: string | null }>(`SELECT referred_by_workspace_id FROM workspaces WHERE id = $1`, [workspaceId])
  return rows[0]?.referred_by_workspace_id ?? null
}

/** Called right after the new workspace is created — best-effort, never
 *  blocks registration. `flag` records a soft fraud signal (still gets the
 *  discount and could still reward — an admin can see it in the list) as
 *  opposed to a hard block, which never calls this at all. */
export async function attachReferral(refereeWorkspaceId: string, referrerWorkspaceId: string, flag?: { reason: string }): Promise<void> {
  await pool.query(`UPDATE workspaces SET referred_by_workspace_id = $2 WHERE id = $1`, [refereeWorkspaceId, referrerWorkspaceId])
  await pool.query(
    `INSERT INTO referrals (referrer_workspace_id, referee_workspace_id, flagged, flag_reason) VALUES ($1, $2, $3, $4)`,
    [referrerWorkspaceId, refereeWorkspaceId, !!flag, flag?.reason ?? null],
  )
}

export interface ReferrerFraudContext { ownerEmail: string | null; signupIp: string | null; createdAt: string }

export async function getReferrerFraudContext(referrerWorkspaceId: string): Promise<ReferrerFraudContext | null> {
  const { rows } = await pool.query<{ email: string | null; signup_ip: string | null; created_at: string }>(
    `SELECT email, signup_ip, created_at FROM users WHERE workspace_id = $1 ORDER BY created_at LIMIT 1`,
    [referrerWorkspaceId],
  )
  if (!rows[0]) return null
  return { ownerEmail: rows[0].email, signupIp: rows[0].signup_ip, createdAt: rows[0].created_at }
}

export async function findReferralByReferee(refereeWorkspaceId: string): Promise<ReferralRow | null> {
  const { rows } = await pool.query<ReferralRow>(`SELECT * FROM referrals WHERE referee_workspace_id = $1`, [refereeWorkspaceId])
  return rows[0] ?? null
}

export async function countRewardedSince(referrerWorkspaceId: string, since: Date): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM referrals WHERE referrer_workspace_id = $1 AND status = 'rewarded' AND rewarded_at >= $2`,
    [referrerWorkspaceId, since],
  )
  return +rows[0].n
}

export async function markReferralPaid(id: string, paymentId: string): Promise<void> {
  await pool.query(`UPDATE referrals SET status = 'paid', paid_at = NOW(), referee_payment_id = $2 WHERE id = $1`, [id, paymentId])
}

export async function markReferralRewarded(id: string, rewardDays: number): Promise<void> {
  await pool.query(`UPDATE referrals SET status = 'rewarded', rewarded_at = NOW(), reward_days = $2 WHERE id = $1`, [id, rewardDays])
}

export async function markReferralCapped(id: string): Promise<void> {
  await pool.query(`UPDATE referrals SET status = 'capped' WHERE id = $1`, [id])
}

export async function markReferralClawedBack(id: string): Promise<void> {
  await pool.query(`UPDATE referrals SET status = 'clawed_back' WHERE id = $1`, [id])
}

/** A payment the fraud check refused to reward — never granted at all, unlike a clawback. */
export async function markReferralBlocked(id: string, reason: string): Promise<void> {
  await pool.query(`UPDATE referrals SET status = 'blocked', flagged = TRUE, flag_reason = $2 WHERE id = $1`, [id, reason])
}

export async function findReferralByPaymentId(paymentId: string): Promise<ReferralRow | null> {
  const { rows } = await pool.query<ReferralRow>(`SELECT * FROM referrals WHERE referee_payment_id = $1`, [paymentId])
  return rows[0] ?? null
}

export interface ReferralSummary { code: string | null; invited: number; paid: number; rewarded: number }

export async function referralSummary(workspaceId: string): Promise<ReferralSummary> {
  const [ws, counts] = await Promise.all([
    pool.query<{ referral_code: string | null }>(`SELECT referral_code FROM workspaces WHERE id = $1`, [workspaceId]),
    pool.query<{ invited: string; paid: string; rewarded: string }>(
      `SELECT COUNT(*)::text AS invited,
              COUNT(*) FILTER (WHERE status IN ('paid', 'rewarded'))::text AS paid,
              COUNT(*) FILTER (WHERE status = 'rewarded')::text AS rewarded
         FROM referrals WHERE referrer_workspace_id = $1`, [workspaceId]),
  ])
  const c = counts.rows[0]
  return { code: ws.rows[0]?.referral_code ?? null, invited: +c.invited, paid: +c.paid, rewarded: +c.rewarded }
}

export interface AdminReferralRow extends ReferralRow {
  referrer_email: string | null
  referee_email:  string | null
}

export async function listAdminReferrals(page: number, pageSize: number): Promise<{ rows: AdminReferralRow[]; total: number }> {
  const total = (await pool.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM referrals`)).rows[0].n
  const { rows } = await pool.query<AdminReferralRow>(`
    SELECT r.*,
           (SELECT email FROM users WHERE workspace_id = r.referrer_workspace_id ORDER BY created_at LIMIT 1) AS referrer_email,
           (SELECT email FROM users WHERE workspace_id = r.referee_workspace_id  ORDER BY created_at LIMIT 1) AS referee_email
      FROM referrals r ORDER BY r.created_at DESC LIMIT $1 OFFSET $2`, [pageSize, (page - 1) * pageSize])
  return { rows, total: +total }
}

export interface ReferralFunnel { invited: number; paid: number; rewarded: number; reward_days_total: number }

export async function referralFunnel(): Promise<ReferralFunnel> {
  const { rows } = await pool.query<{ invited: string; paid: string; rewarded: string; reward_days_total: string }>(`
    SELECT COUNT(*)::text AS invited,
           COUNT(*) FILTER (WHERE status IN ('paid', 'rewarded'))::text AS paid,
           COUNT(*) FILTER (WHERE status = 'rewarded')::text AS rewarded,
           COALESCE(SUM(reward_days) FILTER (WHERE status = 'rewarded'), 0)::text AS reward_days_total
      FROM referrals`)
  const r = rows[0]
  return { invited: +r.invited, paid: +r.paid, rewarded: +r.rewarded, reward_days_total: +r.reward_days_total }
}
