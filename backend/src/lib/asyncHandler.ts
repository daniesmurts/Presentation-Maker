import type { Request, Response, NextFunction, RequestHandler } from 'express'

/** Forwards a rejected async handler to next(err). Use on every async route. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { Promise.resolve(fn(req, res, next)).catch(next) }
}
