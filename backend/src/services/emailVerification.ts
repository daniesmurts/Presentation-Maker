// Stateless HMAC verification tokens — same pattern as the Teaching-assistant
// sibling's emailVerification.ts. The MAC covers the email address, not just
// the user id: a link proves ownership of a *specific* address, so if the
// account's email ever changes, old links stop working. Never expires
// otherwise — a user digging the welcome email out of their inbox weeks
// later should still be able to verify.
//
// The token carries only the user id in the clear (`id.sig`); the route
// extracts the id, loads the row, and re-computes the MAC with the row's
// CURRENT email.

import crypto from 'crypto'
import { config } from '../lib/config'

function sign(userId: string, email: string): string {
  return crypto.createHmac('sha256', config.auth.jwtSecret)
    .update(`email-verify:${userId}:${email.toLowerCase()}`)
    .digest('hex')
}

export function emailVerifyToken(userId: string, email: string): string {
  return `${userId}.${sign(userId, email)}`
}

export function extractUserIdFromVerifyToken(token: string): string | null {
  const dot = token.lastIndexOf('.')
  return dot > 0 ? token.slice(0, dot) : null
}

export function verifyEmailVerifyToken(token: string, currentEmail: string): string | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const userId = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = sign(userId, currentEmail)
  if (sig.length !== expected.length) return null
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? userId : null
}

export function emailVerifyUrl(userId: string, email: string): string {
  return `${config.frontendUrl}/api/auth/verify-email?token=${emailVerifyToken(userId, email)}`
}
