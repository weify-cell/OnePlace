import { connectDatabase } from '../database/index.js'

interface SettingRow {
  key: string
  value: string
  updated_at: string
}

export function getSetting(key: string): string | null {
  const db = connectDatabase()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as SettingRow | undefined
  return row ? row.value : null
}

export function getSettingValue<T>(key: string, defaultValue: T): T {
  const raw = getSetting(key)
  if (raw === null) return defaultValue
  try {
    return JSON.parse(raw) as T
  } catch {
    return defaultValue
  }
}

export function setSetting(key: string, value: unknown): void {
  const db = connectDatabase()
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value))
}

export function getAllSettings(): Record<string, unknown> {
  const db = connectDatabase()
  const rows = db.prepare("SELECT key, value FROM settings WHERE key != 'password_hash'").all() as SettingRow[]
  console.log('Loaded settings:', rows.map(r => ({ key: r.key, value: r.value })))
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    try { result[row.key] = JSON.parse(row.value) } catch { result[row.key] = row.value }
  }
  return result
}
