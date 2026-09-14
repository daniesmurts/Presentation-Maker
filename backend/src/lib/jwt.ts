import jwt from 'jsonwebtoken'
import { UnauthorizedError } from '../errors/AppError'

const ALGORITHM: jwt.Algorithm = 'HS256'
const ISSUER  = 'tezarium'
const EXPIRY  = '7d'

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

export function signToken(payload: { id: string; ws: string }): string {
  return jwt.sign(payload, secret(), { expiresIn: EXPIRY, algorithm: ALGORITHM, issuer: ISSUER })
}

export function verifyToken(token: string): TokenPayload {
  try {
    return jwt.verify(token, secret(), { algorithms: [ALGORITHM], issuer: ISSUER }) as TokenPayload
  } catch {
    throw new UnauthorizedError('Сессия истекла — войдите снова')
  }
}
