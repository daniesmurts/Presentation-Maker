import type { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../lib/jwt'
import { SESSION_COOKIE_NAME } from '../lib/session'
import { findPublicUserById, type PublicUser } from '../db/queries/users'
import { DeactivatedError, ForbiddenError, UnauthorizedError } from '../errors/AppError'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

declare global {
  namespace Express {
    interface Request { user: PublicUser }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined
  if (!token) { next(new UnauthorizedError()); return }

  // CSRF defence-in-depth: SameSite=Lax keeps the cookie off cross-site
  // POSTs, and a cross-site <form> cannot set a custom header either.
  if (MUTATING_METHODS.has(req.method) && req.headers['x-requested-with'] !== 'Tezarium') {
    next(new ForbiddenError('Запрос отклонён'))
    return
  }

  try {
    const payload = verifyToken(token)
    const user = await findPublicUserById(payload.id)
    if (!user) { next(new UnauthorizedError()); return }
    if (user.deactivated_at) { next(new DeactivatedError()); return }
    req.user = user
    next()
  } catch (err) {
    next(err)
  }
}
