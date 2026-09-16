import jwt from 'jsonwebtoken'
import { UnauthorizedError } from '../errors/AppError'

const ALGORITHM: jwt.Algorithm = 'HS256'
const ISSUER  = 'tezarium'
type Expiry = NonNullable<jwt.SignOptions['expiresIn']>
export const SESSION_EXPIRY: Expiry = '7d'
// "Remember me" (CLAUDE.md-style decision, 2026-09-16): unchecked keeps the
// existing 7-day session; checked trades it for 60 days. Both are the same
// JWT mechanism — only expiresIn and the cookie's maxAge change together
// (session.ts).
export const REMEMBER_ME_EXPIRY: Expiry = '60d'

function secret(): string {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET is not set')
  return s
}

export interface TokenPayload {
  id:  string   // user id
  ws:  string   // workspace id
  iat: number
  exp: number
}

export function signToken(payload: { id: string; ws: string }, expiresIn: Expiry = SESSION_EXPIRY): string {
  return jwt.sign(payload, secret(), { expiresIn, algorithm: ALGORITHM, issuer: ISSUER })
}

export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, secret(), { algorithms: [ALGORITHM], issuer: ISSUER }) as TokenPayload
  } catch {
    throw new UnauthorizedError('Сессия истекла — войдите снова')
  }
}
