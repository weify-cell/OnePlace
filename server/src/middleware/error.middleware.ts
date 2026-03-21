import { Request, Response, NextFunction } from 'express'

export function errorMiddleware(err: Error, req: Request, res: Response, _next: NextFunction): void {
  console.error('[Error]', err.message)
  res.status(500).json({ error: 'InternalServerError', message: err.message })
}
