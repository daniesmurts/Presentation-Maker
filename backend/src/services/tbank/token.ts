import { createHash, timingSafeEqual } from 'node:crypto'

// T-Bank request signature (developer.tbank.ru/eacq/intro/developer/token):
// root-level parameters only — nested objects and arrays (Receipt, DATA)
// are NOT part of the token — plus { Password }, sorted by key, VALUES
// concatenated, SHA-256, lowercase hex. The same algorithm verifies an
// incoming notification, with its own Token excluded.
//
// Booleans and numbers are concatenated as their JSON text ("true", "250000")
// — the portal's example signs Amount 19200 as "19200", and Success in a
// notification signs as "true"/"false".

export type TokenParams = Record<string, unknown>

function isRoot(v: unknown): v is string | number | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
}

export function signRequest(params: TokenParams, password: string): string {
  const pairs: Array<[string, string]> = []
  for (const [k, v] of Object.entries(params)) {
    if (k === 'Token' || v == null || !isRoot(v)) continue
    pairs.push([k, String(v)])
  }
  pairs.push(['Password', password])
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return createHash('sha256').update(pairs.map(([, v]) => v).join(''), 'utf8').digest('hex')
}

/** True iff the notification's Token matches our password. Constant-time. */
export function verifyNotification(body: TokenParams, password: string): boolean {
  const given = typeof body.Token === 'string' ? body.Token.toLowerCase() : ''
  if (given.length !== 64) return false
  const expected = signRequest(body, password)
  return timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'))
}
