import { connectDatabase } from '../database/index.js'

export interface ToolCategory {
  id: number
  name: string
  description: string
  tool_count?: number
}

export function listCategories(): ToolCategory[] {
  const db = connectDatabase()
  return (db.prepare(`
    SELECT c.*, COUNT(t.id) as tool_count FROM tool_categories c
    LEFT JOIN tools t ON t.category_id = c.id
    GROUP BY c.id ORDER BY c.id ASC
  `).all() as Record<string, unknown>[]).map(row => ({
    id: row.id as number, name: row.name as string, description: row.description as string,
    tool_count: row.tool_count as number,
  }))
}

export function createCategory(data: { name: string; description?: string }): ToolCategory {
  const db = connectDatabase()
  const r = db.prepare('INSERT INTO tool_categories (name, description) VALUES (?, ?)').run(data.name, data.description || '')
  return db.prepare('SELECT * FROM tool_categories WHERE id = ?').get(r.lastInsertRowid) as unknown as ToolCategory
}

export function updateCategory(id: number, data: { name?: string; description?: string }): ToolCategory | null {
  const db = connectDatabase()
  if (!db.prepare('SELECT 1 FROM tool_categories WHERE id = ?').get(id)) return null
  db.prepare("UPDATE tool_categories SET name=?, description=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(data.name, data.description, id)
  return db.prepare('SELECT * FROM tool_categories WHERE id = ?').get(id) as unknown as ToolCategory
}

export function deleteCategory(id: number): boolean {
  const db = connectDatabase()
  return db.prepare('DELETE FROM tool_categories WHERE id = ?').run(id).changes > 0
}
