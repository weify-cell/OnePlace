import { connectDatabase } from '../database/index.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILLS_DIR = path.resolve(__dirname, '../../data/skills')

// 确保 skills 目录存在
await fs.mkdir(SKILLS_DIR, { recursive: true }).catch(() => {})
export interface SkillConfig {
  id: number
  name: string
  path: string
  enabled: number
  created_at: string
  updated_at: string
}

function rowToConfig(row: Record<string, unknown>): SkillConfig {
  return {
    id: row.id as number, name: row.name as string, path: row.path as string,
    enabled: row.enabled as number, created_at: row.created_at as string, updated_at: row.updated_at as string,
  }
}

export function listSkills(): SkillConfig[] {
  const db = connectDatabase()
  return (db.prepare('SELECT * FROM skills ORDER BY id ASC').all() as Record<string, unknown>[]).map(rowToConfig)
}

export function createSkill(data: Partial<SkillConfig>): SkillConfig {
  const db = connectDatabase()
  const result = db.prepare(
    'INSERT INTO skills (name, path, enabled) VALUES (?, ?, ?)'
  ).run(data.name || '', data.path || '', data.enabled ?? 0)
  return db.prepare('SELECT * FROM skills WHERE id = ?').get(result.lastInsertRowid) as unknown as SkillConfig
}

export function updateSkill(id: number, data: Partial<SkillConfig>): SkillConfig | null {
  const db = connectDatabase()
  if (!db.prepare('SELECT 1 FROM skills WHERE id = ?').get(id)) return null
  db.prepare(
    `UPDATE skills SET name=?, path=?, enabled=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`
  ).run(data.name, data.path, data.enabled, id)
  return db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as unknown as SkillConfig
}

export function deleteSkill(id: number): boolean {
  const db = connectDatabase()
  const row = db.prepare('SELECT path FROM skills WHERE id = ?').get(id) as SkillConfig | undefined
  if (!row) return false
  const filePath = path.resolve(SKILLS_DIR, row.path)
  fs.unlink(filePath).catch(() => {})
  return db.prepare('DELETE FROM skills WHERE id = ?').run(id).changes > 0
}

export async function readSkillFile(id: number): Promise<string | null> {
  const db = connectDatabase()
  const row = db.prepare('SELECT path FROM skills WHERE id = ?').get(id) as SkillConfig | undefined
  if (!row) return null
  try { return await fs.readFile(path.resolve(SKILLS_DIR, row.path), 'utf-8') }
  catch { return null }
}

export async function writeSkillFile(id: number, content: string): Promise<boolean> {
  const db = connectDatabase()
  const row = db.prepare('SELECT path FROM skills WHERE id = ?').get(id) as SkillConfig | undefined
  if (!row) return false
  const filePath = path.resolve(SKILLS_DIR, row.path)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
  return true
}

export interface EnabledSkill {
  name: string
  content: string
}

export async function getEnabledSkills(): Promise<EnabledSkill[]> {
  const db = connectDatabase()
  const rows = db.prepare('SELECT name, path FROM skills WHERE enabled = 1').all() as { name: string; path: string }[]
  const result: EnabledSkill[] = []
  for (const row of rows) {
    try {
      const content = await fs.readFile(path.resolve(SKILLS_DIR, row.path), 'utf-8')
      result.push({ name: row.name, content })
    } catch { /* skip unreadable files */ }
  }
  return result
}
