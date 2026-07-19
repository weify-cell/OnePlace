import { connectDatabase } from '../database/index.js'

export type TodoPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TodoStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'
export type TodoTaskKind = 'one_time' | 'long_term'

export interface Todo {
  id: number
  title: string
  description: string | null
  priority: TodoPriority
  status: TodoStatus
  task_kind: TodoTaskKind
  progress_percent: number | null
  last_progress_note: string | null
  type: string | null
  due_date: string | null
  reminder_time: string | null
  reminder_enabled: boolean
  tags: string[]
  is_deleted: boolean
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface TodoProgressLog {
  id: number
  todo_id: number
  content: string
  created_at: string
}

interface TodoRow {
  id: number
  title: string
  description: string | null
  priority: string
  status: string
  task_kind: string | null
  progress_percent: number | null
  last_progress_note: string | null
  type: string | null
  due_date: string | null
  reminder_time: string | null
  reminder_enabled: number
  tags: string
  is_deleted: number
  completed_at: string | null
  created_at: string
  updated_at: string
}

interface TodoProgressLogRow {
  id: number
  todo_id: number
  content: string
  created_at: string
}

export interface TodoQuery {
  status?: string
  priority?: string
  task_kind?: string
  type?: string
  tag?: string
  search?: string
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface UpdateTodoProgressInput {
  progress_percent?: number | null
  note?: string | null
}

const TODO_TASK_KIND_VALUES = new Set<TodoTaskKind>(['one_time', 'long_term'])

function normalizeTaskKind(taskKind: string | null | undefined): TodoTaskKind {
  if (!taskKind) return 'one_time'
  if (!TODO_TASK_KIND_VALUES.has(taskKind as TodoTaskKind)) {
    throw new Error(`Invalid task_kind: ${taskKind}`)
  }
  return taskKind as TodoTaskKind
}

function normalizeProgressPercent(progressPercent: number | null | undefined): number | null {
  if (progressPercent === null || progressPercent === undefined) return null

  const value = Number(progressPercent)
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid progress_percent: ${progressPercent}`)
  }

  if (value < 0 || value > 100) {
    throw new Error('progress_percent must be between 0 and 100.')
  }

  return Math.round(value)
}

function normalizeProgressNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined) return null
  const trimmed = note.trim()
  return trimmed.length > 0 ? trimmed : null
}

function rowToTodo(row: TodoRow): Todo {
  return {
    ...row,
    task_kind: normalizeTaskKind(row.task_kind),
    progress_percent: row.progress_percent ?? null,
    last_progress_note: row.last_progress_note ?? null,
    tags: JSON.parse(row.tags || '[]'),
    is_deleted: row.is_deleted === 1,
    reminder_enabled: row.reminder_enabled === 1,
    completed_at: row.completed_at || null
  } as Todo
}

function rowToProgressLog(row: TodoProgressLogRow): TodoProgressLog {
  return {
    id: row.id,
    todo_id: row.todo_id,
    content: row.content,
    created_at: row.created_at
  }
}

function assertLongTermTodo(todo: Todo): void {
  if (todo.task_kind !== 'long_term') {
    throw new Error('Only long-term todos can track progress.')
  }
}

export function getTodos(query: TodoQuery) {
  const db = connectDatabase()
  const { status, priority, task_kind, type, tag, search, page = 1, pageSize = 20 } = query

  const conditions: string[] = ['t.is_deleted = 0']
  const params: Array<string | number> = []

  if (status) {
    conditions.push('t.status = ?')
    params.push(status)
  }
  if (priority) {
    conditions.push('t.priority = ?')
    params.push(priority)
  }
  if (task_kind) {
    conditions.push('t.task_kind = ?')
    params.push(normalizeTaskKind(task_kind))
  }
  if (type) {
    conditions.push('t.type = ?')
    params.push(type)
  }
  if (search) {
    conditions.push('(t.title LIKE ? OR t.description LIKE ?)')
    params.push(`%${search}%`, `%${search}%`)
  }
  if (tag) {
    conditions.push('EXISTS (SELECT 1 FROM json_each(t.tags) WHERE value = ?)')
    params.push(tag)
  }

  const where = conditions.join(' AND ')
  const orderBy = status === 'done'
    ? `CASE WHEN t.completed_at IS NULL THEN 1 ELSE 0 END, t.completed_at DESC`
    : `CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date ASC`

  const countRow = db.prepare(`SELECT COUNT(*) as total FROM todos t WHERE ${where}`).get(...params) as { total: number }
  const rows = db.prepare(`SELECT * FROM todos t WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize) as TodoRow[]

  return {
    items: rows.map(rowToTodo),
    total: countRow.total,
    page,
    pageSize
  }
}

export function getTodoById(id: number): Todo | null {
  const db = connectDatabase()
  const row = db.prepare('SELECT * FROM todos WHERE id = ? AND is_deleted = 0').get(id) as TodoRow | undefined
  return row ? rowToTodo(row) : null
}

export function createTodo(data: Partial<Todo>): Todo {
  if (data.reminder_enabled && !data.reminder_time) {
    throw new Error('Reminder time is required when reminder is enabled.')
  }

  const db = connectDatabase()
  const taskKind = normalizeTaskKind(data.task_kind)
  const progressPercent = taskKind === 'long_term' ? normalizeProgressPercent(data.progress_percent) : null
  const progressNote = taskKind === 'long_term' ? normalizeProgressNote(data.last_progress_note) : null

  const result = db.prepare(`
    INSERT INTO todos (
      title,
      description,
      priority,
      status,
      task_kind,
      progress_percent,
      last_progress_note,
      type,
      due_date,
      reminder_time,
      reminder_enabled,
      tags
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.title,
    data.description ?? null,
    data.priority ?? 'medium',
    data.status ?? 'todo',
    taskKind,
    progressPercent,
    progressNote,
    data.type ?? null,
    data.due_date ?? null,
    data.reminder_time ?? null,
    data.reminder_enabled !== false ? 1 : 0,
    JSON.stringify(data.tags ?? [])
  )

  return getTodoById(result.lastInsertRowid as number)!
}

export function updateTodo(id: number, data: Partial<Todo>): Todo | null {
  const db = connectDatabase()
  const existing = getTodoById(id)
  if (!existing) return null

  const updates: string[] = []
  const params: Array<string | number | null> = []
  const nextTaskKind = data.task_kind !== undefined ? normalizeTaskKind(data.task_kind) : existing.task_kind

  if (data.title !== undefined) {
    updates.push('title = ?')
    params.push(data.title)
  }
  if (data.description !== undefined) {
    updates.push('description = ?')
    params.push(data.description)
  }
  if (data.priority !== undefined) {
    updates.push('priority = ?')
    params.push(data.priority)
  }
  if (data.task_kind !== undefined) {
    updates.push('task_kind = ?')
    params.push(nextTaskKind)
  }
  if (nextTaskKind !== 'long_term') {
    updates.push('progress_percent = NULL')
    updates.push('last_progress_note = NULL')
  } else {
    if (data.progress_percent !== undefined) {
      updates.push('progress_percent = ?')
      params.push(normalizeProgressPercent(data.progress_percent))
    }
    if (data.last_progress_note !== undefined) {
      updates.push('last_progress_note = ?')
      params.push(normalizeProgressNote(data.last_progress_note))
    }
  }
  if (data.type !== undefined) {
    updates.push('type = ?')
    params.push(data.type)
  }
  if (data.due_date !== undefined) {
    updates.push('due_date = ?')
    params.push(data.due_date)
  }
  if (data.reminder_time !== undefined) {
    updates.push('reminder_time = ?')
    params.push(data.reminder_time)
  }
  if (data.reminder_enabled !== undefined) {
    updates.push('reminder_enabled = ?')
    params.push(data.reminder_enabled ? 1 : 0)
  }
  if (data.tags !== undefined) {
    updates.push('tags = ?')
    params.push(JSON.stringify(data.tags))
  }

  if (data.status !== undefined) {
    updates.push('status = ?')
    params.push(data.status)
    if (data.status === 'done') {
      updates.push("completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
    } else {
      updates.push('completed_at = NULL')
    }
  }

  if (updates.length === 0) return existing

  updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
  params.push(id)

  db.prepare(`UPDATE todos SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  return getTodoById(id)
}

export function updateTodoProgress(id: number, data: UpdateTodoProgressInput): Todo | null {
  const db = connectDatabase()
  const existing = getTodoById(id)
  if (!existing) return null
  assertLongTermTodo(existing)

  const progressPercent = data.progress_percent !== undefined
    ? normalizeProgressPercent(data.progress_percent)
    : existing.progress_percent
  const note = data.note !== undefined
    ? normalizeProgressNote(data.note)
    : existing.last_progress_note

  if (data.progress_percent === undefined && data.note === undefined) {
    return existing
  }

  db.prepare(`
    UPDATE todos
    SET progress_percent = ?,
        last_progress_note = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ?
  `).run(progressPercent, note, id)

  const logNote = normalizeProgressNote(data.note)
  if (logNote) {
    db.prepare(`
      INSERT INTO todo_progress_logs (todo_id, content)
      VALUES (?, ?)
    `).run(id, logNote)
  }

  return getTodoById(id)
}

export function getTodoProgressLogs(todoId: number, limit = 10): TodoProgressLog[] | null {
  const db = connectDatabase()
  const todo = getTodoById(todoId)
  if (!todo) return null
  assertLongTermTodo(todo)

  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50))
  const rows = db.prepare(`
    SELECT id, todo_id, content, created_at
    FROM todo_progress_logs
    WHERE todo_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(todoId, safeLimit) as TodoProgressLogRow[]

  return rows.map(rowToProgressLog)
}

export function deleteTodo(id: number): boolean {
  const db = connectDatabase()
  const result = db.prepare(
    "UPDATE todos SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND is_deleted = 0"
  ).run(id)
  return result.changes > 0
}

export function getAllTodoTags(): string[] {
  const db = connectDatabase()
  const rows = db.prepare(`
    SELECT DISTINCT je.value as tag
    FROM todos t, json_each(t.tags) je
    WHERE t.is_deleted = 0
    ORDER BY tag
  `).all() as Array<{ tag: string }>
  return rows.map(row => row.tag)
}

export function getTodoCounts() {
  const db = connectDatabase()
  return {
    all: (db.prepare('SELECT COUNT(*) as count FROM todos WHERE is_deleted = 0').get() as { count: number }).count,
    todo: (db.prepare("SELECT COUNT(*) as count FROM todos WHERE is_deleted = 0 AND status = 'todo'").get() as { count: number }).count,
    in_progress: (db.prepare("SELECT COUNT(*) as count FROM todos WHERE is_deleted = 0 AND status = 'in_progress'").get() as { count: number }).count,
    done: (db.prepare("SELECT COUNT(*) as count FROM todos WHERE is_deleted = 0 AND status = 'done'").get() as { count: number }).count,
    cancelled: (db.prepare("SELECT COUNT(*) as count FROM todos WHERE is_deleted = 0 AND status = 'cancelled'").get() as { count: number }).count
  }
}

export function getPendingCount(): number {
  const db = connectDatabase()
  const result = db.prepare("SELECT COUNT(*) as count FROM todos WHERE is_deleted = 0 AND status = 'todo'").get() as { count: number }
  return result.count
}

export function getUrgentCount(): number {
  const db = connectDatabase()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const threeDaysLater = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000)
  const threeDaysLaterStr = threeDaysLater.toISOString().split('T')[0]

  const result = db.prepare(`
    SELECT COUNT(*) as count FROM todos
    WHERE is_deleted = 0
      AND status NOT IN ('done', 'cancelled')
      AND due_date IS NOT NULL
      AND due_date <= ?
  `).get(threeDaysLaterStr) as { count: number }

  return result.count
}
