import crypto from 'crypto'
import { pool } from '../connection'

// Raw 32-byte random tokens carry 256 bits of entropy, so a plain SHA-256
// digest is enough for a single-use, short-lived token — bcrypt's slowness
// buys nothing here and would make the lookup query pointless (can't index
// a slow hash by value). We store the hash so a DB read alone never
// discloses a usable token.
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

export function generateRawToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function invalidateExistingTokens(userId: string): Promise<void> {
  await pool.query(`UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`, [userId])
}

export async function createResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  )
}

export interface ResetTokenRow { id: string; user_id: string }

export async function findValidToken(tokenHash: string): Promise<ResetTokenRow | null> {
  const { rows } = await pool.query<ResetTokenRow>(
    `SELECT id, user_id FROM password_reset_tokens WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW() LIMIT 1`,
    [tokenHash],
  )
  return rows[0] ?? null
}

export async function markTokenUsed(tokenId: string): Promise<void> {
  await pool.query(`UPDATE password_reset_tokens SET used = TRUE WHERE id = $1`, [tokenId])
}
