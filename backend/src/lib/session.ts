import type { Response } from 'express'

export const SESSION_COOKIE_NAME = 'tezarium_session'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // matches jwt.ts SESSION_EXPIRY
const REMEMBER_ME_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000 // matches jwt.ts REMEMBER_ME_EXPIRY

function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' }
}

/** `rememberMe` must match the expiry the token itself was signed with
 *  (lib/jwt.ts) — the cookie outliving the JWT just means an expired token
 *  sits in the browser; the JWT outliving the cookie logs the user out early. */
export function setSessionCookie(res: Response, token: string, rememberMe = false): void {
  res.cookie(SESSION_COOKIE_NAME, token, { ...cookieOptions(), maxAge: rememberMe ? REMEMBER_ME_MAX_AGE_MS : MAX_AGE_MS })
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, cookieOptions())
}
