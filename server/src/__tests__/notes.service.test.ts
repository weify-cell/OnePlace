import { beforeEach, describe, expect, it, vi } from 'vitest'

const notes = [
  {
    id: 1,
    title: 'Alpha note',
    content: 'alpha start middle alpha end',
    content_text: 'alpha start middle alpha end',
    content_format: 'markdown' as const,
    tags: '[]',
    folder_id: null,
    is_pinned: 0,
    is_archived: 0,
    is_deleted: 0,
    is_knowledge_base: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 2,
    title: 'Beta note',
    content: 'beta has alpha inside too',
    content_text: 'beta has alpha inside too',
    content_format: 'markdown' as const,
    tags: '[]',
    folder_id: null,
    is_pinned: 0,
    is_archived: 0,
    is_deleted: 0,
    is_knowledge_base: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 3,
    title: 'Gamma note',
    content: '# Intro\nfirst line\nchapter six overview\nsupporting detail\nchapter six practice\nsummary line',
    content_text: 'Intro first line chapter six overview supporting detail chapter six practice summary line',
    content_format: 'markdown' as const,
    tags: '[]',
    folder_id: null,
    is_pinned: 0,
    is_archived: 0,
    is_deleted: 0,
    is_knowledge_base: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z'
  }
]

function createDbMock() {
  return {
    prepare: vi.fn((sql: string) => ({
      get: (...params: unknown[]) => {
        if (sql.includes('COUNT(*) as total')) {
          return { total: notes.length }
        }
        if (sql.includes('WHERE id = ? AND is_deleted = 0')) {
          return notes.find(note => note.id === Number(params[0])) || undefined
        }
        return undefined
      },
      all: () => notes
    }))
  }
}

vi.mock('../database/index.js', () => ({
  connectDatabase: vi.fn(() => createDbMock())
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('notes.service fuzzySearchNotes', () => {
  it('returns the first 1000 characters as preview when query is empty and note is specified', async () => {
    const service = await import('../services/notes.service.js')

    const result = service.fuzzySearchNotes('', 1, 0)

    expect(result.totalMatches).toBe(1)
    expect(result.selectedIndex).toBe(0)
    expect(result.match).toMatchObject({
      index: 0,
      note_id: 1,
      note_title: 'Alpha note',
      start: 0,
      keyword_start: 0,
      keyword_end: 0
    })
    expect(result.match?.content).toBe('Alpha note\nalpha start middle alpha end')
  })

  it('throws when query is empty and note id is not specified', async () => {
    const service = await import('../services/notes.service.js')

    expect(() => service.fuzzySearchNotes('', undefined, 0)).toThrow('note_id is required when query is empty')
  })

  it('returns all matches and selects the requested global index', async () => {
    const service = await import('../services/notes.service.js')

    const result = service.fuzzySearchNotes('alpha', undefined, 1)

    expect(result.totalMatches).toBe(4)
    expect(result.selectedIndex).toBe(1)
    expect(result.match).toMatchObject({
      index: 1,
      note_id: 1,
      note_title: 'Alpha note'
    })
    expect(result.match?.start).toBe(0)
    expect(result.match?.end).toBe('Alpha note\nalpha start middle alpha end'.length)
    expect(result.match?.content.toLowerCase()).toContain('alpha')
  })

  it('can limit search to a specific note', async () => {
    const service = await import('../services/notes.service.js')

    const result = service.fuzzySearchNotes('alpha', 2, 0)

    expect(result.totalMatches).toBe(1)
    expect(result.match).toMatchObject({
      index: 0,
      note_id: 2,
      note_title: 'Beta note'
    })
    expect(result.match?.content).toContain('alpha')
  })
})

describe('notes.service line-based note access', () => {
  it('searches within a note and returns line and column information', async () => {
    const service = await import('../services/notes.service.js')

    const result = service.searchNoteLines(3, 'chapter six', 1, 1, 1)

    expect(result.totalMatches).toBe(2)
    expect(result.selectedIndex).toBe(1)
    expect(result.match).toMatchObject({
      index: 1,
      note_id: 3,
      note_title: 'Gamma note',
      line: 5,
      column: 1,
      start_line: 5,
      end_line: 5
    })
    expect(result.match?.context_text).toBe('supporting detail\nchapter six practice\nsummary line')
    expect(result.matches).toEqual([
      { index: 0, line: 3, column: 1, matched_text: 'chapter six' },
      { index: 1, line: 5, column: 1, matched_text: 'chapter six' }
    ])
  })

  it('reads a specific line range from a note', async () => {
    const service = await import('../services/notes.service.js')

    const result = service.getNoteLines(3, 2, 4)

    expect(result.note_id).toBe(3)
    expect(result.note_title).toBe('Gamma note')
    expect(result.total_lines).toBe(6)
    expect(result.lines).toEqual([
      { line: 2, content: 'first line' },
      { line: 3, content: 'chapter six overview' },
      { line: 4, content: 'supporting detail' }
    ])
    expect(result.content).toBe('first line\nchapter six overview\nsupporting detail')
  })
})
