import { connectDatabase } from '../database/index.js'

export interface SkillCategory {
  id: number
  name: string
  description: string
  skill_count?: number
}

export function listCategories(): SkillCategory[] {
  const db = connectDatabase()
  return (db.prepare(`
    SELECT c.*, COUNT(s.id) as skill_count FROM skills_categories c
    LEFT JOIN skills s ON s.category_id = c.id
    GROUP BY c.id ORDER BY c.id ASC
  `).all() as Record<string, unknown>[]).map(row => ({
    id: row.id as number, name: row.name as string, description: row.description as string,
    skill_count: row.skill_count as number,
  }))
}

export function createCategory(data: { name: string; description?: string }): SkillCategory {
  const db = connectDatabase()
  const r = db.prepare('INSERT INTO skills_categories (name, description) VALUES (?, ?)').run(data.name, data.description || '')
  return db.prepare('SELECT * FROM skills_categories WHERE id = ?').get(r.lastInsertRowid) as unknown as SkillCategory
}

export function updateCategory(id: number, data: { name?: string; description?: string }): SkillCategory | null {
  const db = connectDatabase()
  if (!db.prepare('SELECT 1 FROM skills_categories WHERE id = ?').get(id)) return null
  db.prepare("UPDATE skills_categories SET name=?, description=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(data.name, data.description, id)
  return db.prepare('SELECT * FROM skills_categories WHERE id = ?').get(id) as unknown as SkillCategory
}

export function deleteCategory(id: number): boolean {
  const db = connectDatabase()
  return db.prepare('DELETE FROM skills_categories WHERE id = ?').run(id).changes > 0
}
