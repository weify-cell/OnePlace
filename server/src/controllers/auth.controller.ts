import { Request, Response } from 'express'
import * as authService from '../services/auth.service.js'

export async function checkSetup(req: Request, res: Response): Promise<void> {
  res.json({ needsSetup: authService.needsSetup() })
}

export async function setupPassword(req: Request, res: Response): Promise<void> {
  const { password } = req.body
  if (!password || password.length < 6) {
    res.status(400).json({ error: 'BadRequest', message: '密码至少6位' })
    return
  }
  try {
    const token = await authService.setupPassword(password)
    res.json({ token })
  } catch (err) {
    res.status(400).json({ error: 'BadRequest', message: (err as Error).message })
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const { password } = req.body
  if (!password) {
    res.status(400).json({ error: 'BadRequest', message: '请输入密码' })
    return
  }
  try {
    const token = await authService.login(password)
    res.json({ token })
  } catch {
    res.status(401).json({ error: 'Unauthorized', message: '密码错误' })
  }
}
