import { connectDatabase } from '../database/index.js'

export interface ToolConfig {
  id: number
  name: string
  label: string
  description: string
  instruction: string
  enabled: number
  created_at: string
  updated_at: string
}

function rowToConfig(row: Record<string, unknown>): ToolConfig {
  return {
    id: row.id as number, name: row.name as string, label: row.label as string,
    description: row.description as string, instruction: row.instruction as string,
    enabled: row.enabled as number, created_at: row.created_at as string, updated_at: row.updated_at as string,
  }
}

export function listTools(): ToolConfig[] {
  const db = connectDatabase()
  return (db.prepare('SELECT * FROM tools ORDER BY id ASC').all() as Record<string, unknown>[]).map(rowToConfig)
}

export function createTool(data: Partial<ToolConfig>): ToolConfig {
  const db = connectDatabase()
  const result = db.prepare(
    'INSERT INTO tools (name, label, description, instruction, enabled) VALUES (?, ?, ?, ?, ?)'
  ).run(data.name || '', data.label || '', data.description || '', data.instruction || '', data.enabled ?? 0)
  return db.prepare('SELECT * FROM tools WHERE id = ?').get(result.lastInsertRowid) as unknown as ToolConfig
}

export function updateTool(id: number, data: Partial<ToolConfig>): ToolConfig | null {
  const db = connectDatabase()
  if (!db.prepare('SELECT 1 FROM tools WHERE id = ?').get(id)) return null
  db.prepare(
    `UPDATE tools SET name=?, label=?, description=?, instruction=?, enabled=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`
  ).run(data.name, data.label, data.description, data.instruction, data.enabled, id)
  return db.prepare('SELECT * FROM tools WHERE id = ?').get(id) as unknown as ToolConfig
}

export function deleteTool(id: number): boolean {
  const db = connectDatabase()
  return db.prepare('DELETE FROM tools WHERE id = ?').run(id).changes > 0
}
