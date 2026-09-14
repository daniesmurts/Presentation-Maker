import { pool } from '../connection'

export interface UserRow {
  id:            string
  workspace_id:  string
  email:         string
  password_hash: string
  display_name:  string | null
  locale:        string
  created_at:    string
}

export interface PublicUser {
  id:           string
  workspace_id: string
  email:        string
  display_name: string | null
  locale:       string
  plan_tier:    string
  plan_expires_at: string | null
  /** What this tier may do here — set by the auth route from lib/planTier.ts. */
  features?:    { pptxExport: boolean; billing: boolean }
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(`SELECT * FROM users WHERE email = $1`, [email.toLowerCase()])
  return rows[0] ?? null
}

export async function findPublicUserById(id: string): Promise<PublicUser | null> {
  const { rows } = await pool.query<PublicUser>(
    `SELECT u.id, u.workspace_id, u.email, u.display_name, u.locale, w.plan_tier, w.plan_expires_at
       FROM users u JOIN workspaces w ON w.id = u.workspace_id
      WHERE u.id = $1`,
    [id],
  )
  return rows[0] ?? null
}

/** One workspace per user at signup (TODO A decisions). One transaction. */
export async function createUserWithWorkspace(email: string, passwordHash: string, displayName: string | null): Promise<UserRow> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const ws = await client.query<{ id: string }>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [displayName || email.toLowerCase()],
    )
    const { rows } = await client.query<UserRow>(
      `INSERT INTO users (workspace_id, email, password_hash, display_name) VALUES ($1, $2, $3, $4) RETURNING *`,
      [ws.rows[0].id, email.toLowerCase(), passwordHash, displayName],
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
