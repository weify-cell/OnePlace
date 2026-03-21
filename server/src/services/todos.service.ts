import { connectDatabase } from '../database/index.js'

export interface Todo {
  id: number
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'todo' | 'in_progress' | 'done' | 'cancelled'
  type: string | null
  due_date: string | null
  tags: string[]
  is_deleted: boolean
  created_at: string
  updated_at: string
}

interface TodoRow {
  id: number
  title: string
  description: string | null
  priority: string
  status: string
  type: string | null
  due_date: string | null
  tags: string
  is_deleted: number
  created_at: string
  updated_at: string
}

function rowToTodo(row: TodoRow): Todo {
  return {
    ...row,
    tags: JSON.parse(row.tags || '[]'),
    is_deleted: row.is_deleted === 1
  } as Todo
}

export interface TodoQuery {
  status?: string
  priority?: string
  type?: string
  tag?: string
  search?: string
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export function getTodos(query: TodoQuery) {
  const db = connectDatabase()
  const { status, priority, type, tag, search, page = 1, pageSize = 20, sortBy = 'created_at', sortOrder = 'desc' } = query

  const conditions: string[] = ['t.is_deleted = 0']
  const params: (string | number)[] = []

  if (status) { conditions.push('t.status = ?'); params.push(status) }
  if (priority) { conditions.push('t.priority = ?'); params.push(priority) }
  if (type) { conditions.push('t.type = ?'); params.push(type) }
  if (search) { conditions.push('(t.title LIKE ? OR t.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`) }
  if (tag) { conditions.push(`EXISTS (SELECT 1 FROM json_each(t.tags) WHERE value = ?)`); params.push(tag) }

  const where = conditions.join(' AND ')
  const validSort = ['created_at', 'updated_at', 'due_date', 'priority', 'title'].includes(sortBy) ? sortBy : 'created_at'
  const order = sortOrder === 'asc' ? 'ASC' : 'DESC'

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM todos t WHERE ${where}`).get(...params) as { total: number }
  const rows = db.prepare(`SELECT * FROM todos t WHERE ${where} ORDER BY t.${validSort} ${order} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize) as TodoRow[]

  return { items: rows.map(rowToTodo), total: countRow.total, page, pageSize }
}

export function getTodoById(id: number): Todo | null {
  const db = connectDatabase()
  const row = db.prepare('SELECT * FROM todos WHERE id = ? AND is_deleted = 0').get(id) as TodoRow | undefined
  return row ? rowToTodo(row) : null
}

export function createTodo(data: Partial<Todo>): Todo {
  const db = connectDatabase()
  const result = db.prepare(`
    INSERT INTO todos (title, description, priority, status, type, due_date, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.title,
    data.description ?? null,
    data.priority ?? 'medium',
    data.status ?? 'todo',
    data.type ?? null,
    data.due_date ?? null,
    JSON.stringify(data.tags ?? [])
  )
  return getTodoById(result.lastInsertRowid as number)!
}

export function updateTodo(id: number, data: Partial<Todo>): Todo | null {
  const db = connectDatabase()
  const existing = getTodoById(id)
  if (!existing) return null

  const updates: string[] = []
  const params: (string | number | null)[] = []

  if (data.title !== undefined) { updates.push('title = ?'); params.push(data.title) }
  if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description) }
  if (data.priority !== undefined) { updates.push('priority = ?'); params.push(data.priority) }
  if (data.status !== undefined) { updates.push('status = ?'); params.push(data.status) }
  if (data.type !== undefined) { updates.push('type = ?'); params.push(data.type) }
  if (data.due_date !== undefined) { updates.push('due_date = ?'); params.push(data.due_date) }
  if (data.tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(data.tags)) }

  if (updates.length === 0) return existing

  updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
  params.push(id)

  db.prepare(`UPDATE todos SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  return getTodoById(id)
}

export function deleteTodo(id: number): boolean {
  const db = connectDatabase()
  const result = db.prepare("UPDATE todos SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND is_deleted = 0").run(id)
  return result.changes > 0
}

export function getAllTodoTags(): string[] {
  const db = connectDatabase()
  const rows = db.prepare(`
    SELECT DISTINCT je.value as tag
    FROM todos t, json_each(t.tags) je
    WHERE t.is_deleted = 0
    ORDER BY tag
  `).all() as { tag: string }[]
  return rows.map(r => r.tag)
}
