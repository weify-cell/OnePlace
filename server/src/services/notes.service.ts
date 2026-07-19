import { connectDatabase } from '../database/index.js'
import { extractFullPlainText, extractPlainTextWithLineBreaks } from './note-text.service.js'

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
    return texts.join(' ').slice(0, 500)
  } catch {
    return content.slice(0, 500)
  }
}

// Extract plain text from Markdown content
function extractTextFromMarkdown(markdown: string): string {
  return markdown
    .replace(/!\[.*?\]\(.*?\)/g, '') // 去除图片语法
    .replace(/\[.*?\]\(.*?\)/g, '$1') // 去除链接，保留文本
    .replace(/[#*`_~[\]]/g, '')       // 去除标题/加粗/斜体等符号
    .replace(/\n+/g, ' ')             // 合并换行
    .slice(0, 500)
}

export interface NoteQuery {
  tag?: string
  search?: string
  folder_id?: number | 'none'
  is_archived?: boolean
  is_pinned?: boolean
  page?: number
  pageSize?: number
}

export interface NoteFuzzySearchMatch {
  index: number
  note_id: number
  note_title: string
  start: number
  end: number
  keyword_start: number
  keyword_end: number
  content: string
}

export interface NoteFuzzySearchResult {
  query: string
  selectedIndex: number
  totalMatches: number
  match: NoteFuzzySearchMatch | null
  matches: Array<Pick<NoteFuzzySearchMatch, 'index' | 'note_id' | 'note_title' | 'start' | 'end'>>
}

export interface NoteLineSearchMatch {
  index: number
  note_id: number
  note_title: string
  line: number
  column: number
  start_line: number
  end_line: number
  start_column: number
  end_column: number
  matched_text: string
  context_text: string
}

export interface NoteLineSearchResult {
  query: string
  selectedIndex: number
  totalMatches: number
  match: NoteLineSearchMatch | null
  matches: Array<Pick<NoteLineSearchMatch, 'index' | 'line' | 'column' | 'matched_text'>>
}

export interface NoteLineRangeResult {
  note_id: number
  note_title: string
  start_line: number
  end_line: number
  total_lines: number
  lines: Array<{ line: number; content: string }>
  content: string
}

export function getNotes(query: NoteQuery) {
  const db = connectDatabase()
  const { tag, search, folder_id, is_archived = false, is_pinned, page = 1, pageSize = 20 } = query

  const conditions: string[] = ['is_deleted = 0', `is_archived = ${is_archived ? 1 : 0}`]
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
  if ('folder_id' in data) { updates.push('folder_id = ?'); params.push(data.folder_id ?? null) }
  if (data.content_format !== undefined) { updates.push('content_format = ?'); params.push(data.content_format) }
  if (data.is_knowledge_base !== undefined) { updates.push('is_knowledge_base = ?'); params.push(data.is_knowledge_base ? 1 : 0) }

  if (updates.length === 0) return existing

  updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
  params.push(id)

  db.prepare(`UPDATE notes SET ${updates.join(', ')} WHERE id = ?`).run(...params)

  // Trigger knowledge base embedding if is_knowledge_base changed
  if (data.is_knowledge_base !== undefined && data.is_knowledge_base !== existing.is_knowledge_base) {
    import('./knowledge-base.service.js').then(({ triggerEmbedding }) => {
      triggerEmbedding(id).catch(console.error)
    })
  }

  return getNoteById(id)
}

export function deleteNote(id: number): boolean {
  const db = connectDatabase()
  const result = db.prepare("UPDATE notes SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND is_deleted = 0").run(id)
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

function buildSearchText(note: Note): string {
  const plainContent = extractFullPlainText(note.content, note.content_format)
  return `${note.title}\n${plainContent}`.trim()
}

function buildLineSearchText(note: Note): string {
  return extractPlainTextWithLineBreaks(note.content, note.content_format).trim()
}

function splitNoteLines(note: Note): string[] {
  const text = buildLineSearchText(note)
  return text ? text.split('\n') : ['']
}

function buildPreviewMatches(notes: Note[]): NoteFuzzySearchMatch[] {
  return notes.map((note, idx) => {
    const searchText = buildSearchText(note)
    const end = Math.min(searchText.length, 1000)
    return {
      index: idx,
      note_id: note.id,
      note_title: note.title,
      start: 0,
      end,
      keyword_start: 0,
      keyword_end: 0,
      content: searchText.slice(0, end)
    }
  })
}

function findAllMatchOffsets(text: string, query: string): number[] {
  const haystack = text.toLocaleLowerCase()
  const needle = query.toLocaleLowerCase().trim()
  if (!needle) return []

  const matches: number[] = []
  let fromIndex = 0
  while (fromIndex < haystack.length) {
    const matchIndex = haystack.indexOf(needle, fromIndex)
    if (matchIndex === -1) break
    matches.push(matchIndex)
    fromIndex = matchIndex + Math.max(needle.length, 1)
  }
  return matches
}

const FUZZY_SEARCH_CONTEXT_BEFORE = 100
const FUZZY_SEARCH_CONTEXT_AFTER = 900
const DEFAULT_LINE_CONTEXT_BEFORE = 3
const DEFAULT_LINE_CONTEXT_AFTER = 8

function buildLineOffsets(lines: string[]): number[] {
  const offsets: number[] = []
  let cursor = 0
  for (const line of lines) {
    offsets.push(cursor)
    cursor += line.length + 1
  }
  return offsets
}

function getLineAndColumnForOffset(lines: string[], lineOffsets: number[], offset: number): { line: number; column: number } {
  for (let i = lineOffsets.length - 1; i >= 0; i--) {
    if (offset >= lineOffsets[i]) {
      return {
        line: i + 1,
        column: offset - lineOffsets[i] + 1
      }
    }
  }

  return { line: 1, column: 1 }
}

export function fuzzySearchNotes(query: string, noteId?: number, index = 0): NoteFuzzySearchResult {
  const normalizedQuery = query.trim()
  if (!normalizedQuery && noteId === undefined) {
    throw new Error('note_id is required when query is empty')
  }

  const notes = noteId !== undefined
    ? [getNoteById(noteId)].filter((note): note is Note => note !== null)
    : getNotes({ is_archived: false, page: 1, pageSize: 100000 }).items

  const allMatches: NoteFuzzySearchMatch[] = normalizedQuery
    ? []
    : buildPreviewMatches(notes)

  if (normalizedQuery) {
    for (const note of notes) {
      const searchText = buildSearchText(note)
      const offsets = findAllMatchOffsets(searchText, normalizedQuery)

      for (const offset of offsets) {
        const keywordEnd = offset + normalizedQuery.length
        const start = Math.max(0, offset - FUZZY_SEARCH_CONTEXT_BEFORE)
        const end = Math.min(searchText.length, keywordEnd + FUZZY_SEARCH_CONTEXT_AFTER)
        allMatches.push({
          index: allMatches.length,
          note_id: note.id,
          note_title: note.title,
          start,
          end,
          keyword_start: offset,
          keyword_end: keywordEnd,
          content: searchText.slice(start, end)
        })
      }
    }
  }

  const safeIndex = allMatches.length === 0
    ? 0
    : Math.min(Math.max(index, 0), allMatches.length - 1)

  return {
    query: normalizedQuery,
    selectedIndex: safeIndex,
    totalMatches: allMatches.length,
    match: allMatches[safeIndex] || null,
    matches: allMatches.map(({ index: matchIndex, note_id, note_title, start, end }) => ({
      index: matchIndex,
      note_id,
      note_title,
      start,
      end
    }))
  }
}

export function searchNoteLines(
  noteId: number,
  query: string,
  index = 0,
  beforeLines = DEFAULT_LINE_CONTEXT_BEFORE,
  afterLines = DEFAULT_LINE_CONTEXT_AFTER
): NoteLineSearchResult {
  const note = getNoteById(noteId)
  if (!note) {
    throw new Error(`Note ${noteId} not found.`)
  }

  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    throw new Error('query is required')
  }

  const lines = splitNoteLines(note)
  const fullText = lines.join('\n')
  const lineOffsets = buildLineOffsets(lines)
  const offsets = findAllMatchOffsets(fullText, normalizedQuery)
  const safeBeforeLines = Math.max(0, beforeLines)
  const safeAfterLines = Math.max(0, afterLines)

  const allMatches: NoteLineSearchMatch[] = offsets.map((offset, matchIndex) => {
    const keywordEnd = offset + normalizedQuery.length
    const startPos = getLineAndColumnForOffset(lines, lineOffsets, offset)
    const endPos = getLineAndColumnForOffset(lines, lineOffsets, Math.max(offset, keywordEnd - 1))
    const contextStartLine = Math.max(1, startPos.line - safeBeforeLines)
    const contextEndLine = Math.min(lines.length, endPos.line + safeAfterLines)

    return {
      index: matchIndex,
      note_id: note.id,
      note_title: note.title,
      line: startPos.line,
      column: startPos.column,
      start_line: startPos.line,
      end_line: endPos.line,
      start_column: startPos.column,
      end_column: endPos.column,
      matched_text: fullText.slice(offset, keywordEnd),
      context_text: lines.slice(contextStartLine - 1, contextEndLine).join('\n')
    }
  })

  const safeIndex = allMatches.length === 0
    ? 0
    : Math.min(Math.max(index, 0), allMatches.length - 1)

  return {
    query: normalizedQuery,
    selectedIndex: safeIndex,
    totalMatches: allMatches.length,
    match: allMatches[safeIndex] || null,
    matches: allMatches.map(({ index: matchIndex, line, column, matched_text }) => ({
      index: matchIndex,
      line,
      column,
      matched_text
    }))
  }
}

export function getNoteLines(noteId: number, startLine: number, endLine: number): NoteLineRangeResult {
  const note = getNoteById(noteId)
  if (!note) {
    throw new Error(`Note ${noteId} not found.`)
  }

  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < 1) {
    throw new Error('start_line and end_line must be positive integers')
  }

  if (endLine < startLine) {
    throw new Error('end_line must be greater than or equal to start_line')
  }

  const lines = splitNoteLines(note)
  const totalLines = lines.length

  if (startLine > totalLines) {
    throw new Error(`start_line ${startLine} exceeds total lines ${totalLines}`)
  }

  const safeEndLine = Math.min(endLine, totalLines)
  const rangeLines = lines
    .slice(startLine - 1, safeEndLine)
    .map((content, idx) => ({
      line: startLine + idx,
      content
    }))

  return {
    note_id: note.id,
    note_title: note.title,
    start_line: startLine,
    end_line: safeEndLine,
    total_lines: totalLines,
    lines: rangeLines,
    content: rangeLines.map(line => line.content).join('\n')
  }
}
