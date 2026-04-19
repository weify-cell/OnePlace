import { connectDatabase } from '../database/index.js'
import { enqueueEmbeddingTask } from './vector/embedding-queue.js'

export interface Note {
  id: number
  title: string
  content: string
  content_text: string
  content_format: 'tiptap' | 'markdown'
  tags: string[]
  folder_id: number | null
  is_pinned: boolean
  is_archived: boolean
  is_deleted: boolean
  is_knowledge_base: boolean
  created_at: string
  updated_at: string
}

interface NoteRow {
  id: number
  title: string
  content: string
  content_text: string
  content_format: string
  tags: string
  folder_id: number | null
  is_pinned: number
  is_archived: number
  is_deleted: number
  is_knowledge_base: number
  created_at: string
  updated_at: string
}

function rowToNote(row: NoteRow): Note {
  return {
    ...row,
    content_format: row.content_format as 'tiptap' | 'markdown',
    tags: JSON.parse(row.tags || '[]'),
    folder_id: row.folder_id ?? null,
    is_pinned: row.is_pinned === 1,
    is_archived: row.is_archived === 1,
    is_deleted: row.is_deleted === 1,
    is_knowledge_base: row.is_knowledge_base === 1
  }
}

// Extract plain text from Tiptap JSON content
function extractText(content: string, contentFormat: 'tiptap' | 'markdown' = 'tiptap'): string {
  if (contentFormat === 'markdown') {
    return extractTextFromMarkdown(content)
  }
  // Tiptap JSON parsing
  try {
    const doc = JSON.parse(content)
    const texts: string[] = []
    function traverse(node: { text?: string; content?: unknown[] }) {
      if (node.text) texts.push(node.text)
      if (node.content) node.content.forEach(child => traverse(child as { text?: string; content?: unknown[] }))
    }
    traverse(doc)
    return texts.join(' ')
  } catch {
    return content
  }
}

// Extract plain text from Markdown content
function extractTextFromMarkdown(markdown: string): string {
  return markdown
    .replace(/!\[.*?\]\(.*?\)/g, '') // 去除图片语法
    .replace(/\[.*?\]\(.*?\)/g, '$1') // 去除链接，保留文本
    .replace(/[#*`_~[\]]/g, '')       // 去除标题/加粗/斜体等符号
    .replace(/\n+/g, ' ')             // 合并换行
}

export interface NoteQuery {
  tag?: string
  search?: string
  folder_id?: number | 'none'
  is_archived?: boolean
  is_pinned?: boolean
  is_knowledge_base?: boolean
  page?: number
  pageSize?: number
}

export function getNotes(query: NoteQuery) {
  const db = connectDatabase()
  const { tag, search, folder_id, is_archived = false, is_knowledge_base=false,is_pinned, page = 1, pageSize = 20 } = query

  const conditions: string[] = ['is_deleted = 0', `is_archived = ${is_archived ? 1 : 0}`,`is_knowledge_base= ${is_knowledge_base ? 1 : 0}`]
  const params: (string | number)[] = []

  if (is_pinned !== undefined) { conditions.push(`is_pinned = ${is_pinned ? 1 : 0}`) }
  if (search) { conditions.push('(title LIKE ? OR content_text LIKE ?)'); params.push(`%${search}%`, `%${search}%`) }
  if (tag) { conditions.push(`EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)`); params.push(tag) }
  if (folder_id === 'none') {
    conditions.push('folder_id IS NULL')
  } else if (folder_id !== undefined) {
    conditions.push('folder_id = ?')
    params.push(folder_id)
  }

  const where = conditions.join(' AND ')
  const countRow = db.prepare(`SELECT COUNT(*) as total FROM notes WHERE ${where}`).get(...params) as { total: number }
  const rows = db.prepare(`
    SELECT * FROM notes WHERE ${where}
    ORDER BY is_pinned DESC, updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize) as NoteRow[]

  return { items: rows.map(rowToNote), total: countRow.total, page, pageSize }
}

export function getNoteById(id: number): Note | null {
  const db = connectDatabase()
  const row = db.prepare('SELECT * FROM notes WHERE id = ? AND is_deleted = 0').get(id) as NoteRow | undefined
  return row ? rowToNote(row) : null
}

export function createNote(data?: { folder_id?: number | null }): Note {
  const db = connectDatabase()
  const folderId = data?.folder_id ?? null
  const result = db.prepare(
    `INSERT INTO notes (title, content, content_text, tags, folder_id, content_format) VALUES ('无标题', '', '', '[]', ?, 'markdown')`
  ).run(folderId)
  return getNoteById(result.lastInsertRowid as number)!
}

export function updateNote(id: number, data: Partial<Note>): Note | null {
  const db = connectDatabase()
  const existing = getNoteById(id)
  if (!existing) return null

  const updates: string[] = []
  const params: (string | number | null)[] = []

  if (data.title !== undefined) { updates.push('title = ?'); params.push(data.title) }
  if (data.content !== undefined) {
    updates.push('content = ?', 'content_text = ?')
    const format = data.content_format ?? existing.content_format
    params.push(data.content, extractText(data.content, format))
  }
  if (data.tags !== undefined) { updates.push('tags = ?'); params.push(JSON.stringify(data.tags)) }
  if (data.is_pinned !== undefined) { updates.push('is_pinned = ?'); params.push(data.is_pinned ? 1 : 0) }
  if (data.is_archived !== undefined) { updates.push('is_archived = ?'); params.push(data.is_archived ? 1 : 0) }
  if (data.is_knowledge_base !== undefined) { updates.push('is_knowledge_base = ?'); params.push(data.is_knowledge_base ? 1 : 0) }
  if ('folder_id' in data) { updates.push('folder_id = ?'); params.push(data.folder_id ?? null) }
  if (data.content_format !== undefined) { updates.push('content_format = ?'); params.push(data.content_format) }

  if (updates.length === 0) return existing

  updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
  params.push(id)

  db.prepare(`UPDATE notes SET ${updates.join(', ')} WHERE id = ?`).run(...params)

  // Trigger async embedding indexing
  // 只有当前用户勾选了同步到知识库，才会触发这个任务
  if (data.is_knowledge_base === true || (data.is_knowledge_base === undefined && existing.is_knowledge_base)) {
    console.log('Enqueue embedding task for note', id)
    enqueueEmbeddingTask({ noteId: id, action: 'upsert', timestamp: Date.now() })
  }
  return getNoteById(id)
}

export function deleteNote(id: number): boolean {
  const db = connectDatabase()
  const result = db.prepare("UPDATE notes SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND is_deleted = 0").run(id)

  // Trigger async embedding deletion
  enqueueEmbeddingTask({ noteId: id, action: 'delete', timestamp: Date.now() })

  return result.changes > 0
}

export function getAllNoteTags(): string[] {
  const db = connectDatabase()
  const rows = db.prepare(`
    SELECT DISTINCT je.value as tag
    FROM notes n, json_each(n.tags) je
    WHERE n.is_deleted = 0
    ORDER BY tag
  `).all() as { tag: string }[]
  return rows.map(r => r.tag)
}
