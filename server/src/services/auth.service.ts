import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { connectDatabase } from '../database/index.js'

const JWT_SECRET = () => process.env.JWT_SECRET || 'oneplace-default-secret'
const JWT_EXPIRES_IN = '30d'

export function getPasswordHash(): string {
  const db = connectDatabase()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('password_hash') as { value: string } | undefined
  if (!row) return ''
  try {
    return JSON.parse(row.value) as string
  } catch {
    return ''
  }
}

export function setPasswordHash(hash: string): void {
  const db = connectDatabase()
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run('password_hash', JSON.stringify(hash))
}

export function needsSetup(): boolean {
  const hash = getPasswordHash()
  return !hash || hash === ''
}

export async function setupPassword(password: string): Promise<string> {
  if (!needsSetup()) {
    throw new Error('密码已设置，请使用登录接口')
  }
  const hash = await bcrypt.hash(password, 12)
  setPasswordHash(hash)
  return signToken()
}

export async function login(password: string): Promise<string> {
  const hash = getPasswordHash()
  if (!hash) throw new Error('密码未设置')
  const valid = await bcrypt.compare(password, hash)
  if (!valid) throw new Error('密码错误')
  return signToken()
}

function signToken(): string {
  return jwt.sign({ sub: 'user' }, JWT_SECRET(), { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions)
}
