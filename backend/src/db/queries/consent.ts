import { pool } from '../connection'

// The version is the date the documents were last changed — the same
// string the public site prints at the top of /legal/terms and
// /legal/privacy. Bump it when the text changes materially.
export const TERMS_VERSION = '2026-09-16'

/** Record that a user accepted the terms and the privacy policy. */
export async function recordTermsAcceptance(userId: string, version = TERMS_VERSION): Promise<void> {
  await pool.query(`UPDATE users SET terms_accepted_at = now(), terms_version = $2 WHERE id = $1`, [userId, version])
}
