import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: '请先登录' })
    return
  }

  const token = authHeader.slice(7)
  const secret = process.env.JWT_SECRET || 'oneplace-default-secret'

  try {
    const payload = jwt.verify(token, secret) as { sub: string; iat: number; exp: number }
    ;(req as Request & { userId: string }).userId = payload.sub
    next()
  } catch {
    res.status(401).json({ error: 'Unauthorized', message: 'Token 无效或已过期，请重新登录' })
  }
}
