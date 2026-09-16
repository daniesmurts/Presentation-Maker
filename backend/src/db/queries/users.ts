import { pool } from '../connection'

export interface UserRow {
  id:            string
  workspace_id:  string
  email:         string
  // NULL for a Yandex-ID-only account — nothing to compare a password
  // against, so routes/auth.ts must check this before bcrypt.compare.
  password_hash: string | null
  display_name:  string | null
  locale:        string
  deactivated_at: string | null
  signup_ip:     string | null
  email_verified_at: string | null
  yandex_id:     string | null
  created_at:    string
}

export interface PublicUser {
  id:           string
  workspace_id: string
  email:        string
  display_name: string | null
  locale:       string
  is_admin:     boolean
  deactivated_at: string | null
  email_verified_at: string | null
  plan_tier:    string
  plan_expires_at: string | null
  /** What this tier may do here — set by the auth route from lib/planTier.ts. */
  features?:    { billing: boolean }
  quota?:       Record<'talks' | 'pptx' | 'pdf', { used: number; limit: number | null }>
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase()])
  return rows[0] ?? null
}

export async function findPublicUserById(id: string): Promise<PublicUser | null> {
  const { rows } = await pool.query<PublicUser>(
    `SELECT u.id, u.workspace_id, u.email, u.display_name, u.locale, u.is_admin, u.deactivated_at, u.email_verified_at, w.plan_tier, w.plan_expires_at
       FROM users u JOIN workspaces w ON w.id = u.workspace_id
      WHERE u.id = $1`,
    [id],
  )
  return rows[0] ?? null
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id])
  return rows[0] ?? null
}

export async function findUserByYandexId(yandexId: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(`SELECT * FROM users WHERE yandex_id = $1`, [yandexId])
  return rows[0] ?? null
}

/** Linking is separate from creation: an existing password account whose
 *  email matches a Yandex account gets the id attached (and the email
 *  counted verified — Yandex vouches for it) rather than a second row. */
export async function linkYandexId(userId: string, yandexId: string): Promise<void> {
  await pool.query(`UPDATE users SET yandex_id = $1, email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $2`, [yandexId, userId])
}

export async function setEmailVerified(userId: string): Promise<void> {
  await pool.query(`UPDATE users SET email_verified_at = NOW() WHERE id = $1 AND email_verified_at IS NULL`, [userId])
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, userId])
}

/** One workspace per user at signup (TODO A decisions). One transaction.
 *  `signupIp` is used only for the referral fraud checks (TODO M) — never
 *  logged anywhere else, never shown to anyone but an admin. `passwordHash`
 *  is null for a Yandex-ID-only signup; `yandexId` set marks the email
 *  verified at creation (Yandex vouches for it), same as password
 *  registration's email being unverified until the confirmation link. */
export async function createUserWithWorkspace(
  email: string, passwordHash: string | null, displayName: string | null, isAdmin = false, signupIp: string | null = null, yandexId: string | null = null,
): Promise<UserRow> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const ws = await client.query<{ id: string }>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [displayName || email.toLowerCase()],
    )
    const { rows } = await client.query<UserRow>(
      `INSERT INTO users (workspace_id, email, password_hash, display_name, is_admin, signup_ip, yandex_id, email_verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7::text IS NOT NULL THEN NOW() END) RETURNING *`,
      [ws.rows[0].id, email.toLowerCase(), passwordHash, displayName, isAdmin, signupIp, yandexId],
    )
    await client.query('COMMIT')
    return rows[0]
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/** The admin role follows ADMIN_EMAILS exactly: granted to those, revoked from everyone else (TODO M). */
export async function syncAdminRole(adminEmails: string[]): Promise<{ granted: number; revoked: number }> {
  const granted = await pool.query(`UPDATE users SET is_admin = TRUE  WHERE email = ANY($1::text[]) AND NOT is_admin`, [adminEmails])
  const revoked = await pool.query(`UPDATE users SET is_admin = FALSE WHERE NOT (email = ANY($1::text[])) AND is_admin`, [adminEmails])
  return { granted: granted.rowCount ?? 0, revoked: revoked.rowCount ?? 0 }
}
