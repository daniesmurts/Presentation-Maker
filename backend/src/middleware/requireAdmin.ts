import type { Request, Response, NextFunction } from 'express'
import { NotFoundError } from '../errors/AppError'

// After `authenticate`. A non-admin gets 404, not 403: the panel's existence
// is not something a signed-in user needs to learn from an error code.
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.is_admin) { next(new NotFoundError()); return }
  next()
}
