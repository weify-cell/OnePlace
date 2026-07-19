import { beforeEach, describe, expect, it, vi } from 'vitest'

const baseNote = {
  id: 1,
  title: 'Test note',
  content: 'Hello knowledge base',
  content_text: 'Hello knowledge base',
  content_format: 'markdown' as const,
  tags: [],
  folder_id: null,
  is_pinned: false,
  is_archived: false,
  is_deleted: false,
  is_knowledge_base: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
}

function setupMocks(options?: {
  upsertResult?: { success: boolean; count?: number; error?: string }
}) {
  const notes = [baseNote]
  const getNotes = vi.fn(({ page }: { page: number }) => ({
    items: page === 1 ? notes : [],
    total: notes.length,
    page,
    pageSize: 50
  }))
  const getNoteById = vi.fn((id: number) => notes.find(note => note.id === id) || null)
  const embedText = vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
  const upsertChunks = vi.fn().mockResolvedValue(options?.upsertResult || { success: true, count: 1 })

  vi.doMock('../services/notes.service.js', () => ({
    getNotes,
    getNoteById
  }))
  vi.doMock('../services/settings.service.js', () => ({
    getSettingValue: vi.fn((key: string, defaultValue: unknown) => {
      const values: Record<string, unknown> = {
        kb_enabled: false,
        qdrant_url: 'http://localhost:6333',
        qdrant_collection: 'notes_knowledge_base',
        kb_chunk_size: 500,
        kb_chunk_overlap: 50,
        embedding_provider: 'qwen',
        embedding_model: 'text-embedding-v4'
      }
      return key in values ? values[key] : defaultValue
    })
  }))
  vi.doMock('../services/ai/embedding-client.js', () => ({
    embedText
  }))
  vi.doMock('../services/ai/rerank-client.js', () => ({
    rerankTextWithFallback: vi.fn()
  }))
  vi.doMock('../services/vector/vector.service.js', () => ({
    upsertChunks,
    searchChunks: vi.fn(),
    deleteChunksByNoteId: vi.fn()
  }))

  return { getNotes, getNoteById, embedText, upsertChunks }
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('knowledge-base.service rebuild progress', () => {
  it('marks rebuild as running before async indexing finishes', async () => {
    const mocks = setupMocks()
    const service = await import('../services/knowledge-base.service.js')

    const rebuild = service.rebuildAllIndex()

    expect(service.getRebuildStatus()).toMatchObject({
      running: true,
      phase: 'preparing',
      totalNotes: 0,
      noteStatuses: []
    })

    await rebuild

    expect(mocks.upsertChunks).toHaveBeenCalledTimes(1)
    expect(service.getRebuildStatus()).toMatchObject({
      running: false,
      phase: 'completed',
      totalNotes: 1,
      completedNotes: 1,
      failedNotes: 0,
      currentNoteId: null,
      noteStatuses: [
        expect.objectContaining({
          noteId: 1,
          noteTitle: 'Test note',
          phase: 'completed'
        })
      ]
    })
  })

  it('marks rebuild as failed when vector upsert returns failure', async () => {
    setupMocks({ upsertResult: { success: false, error: 'Qdrant unavailable' } })
    const service = await import('../services/knowledge-base.service.js')

    const result = await service.rebuildAllIndex()

    expect(result).toEqual({ total: 1, succeeded: 0, failed: 1 })
    expect(service.getRebuildStatus()).toMatchObject({
      running: false,
      phase: 'failed',
      totalNotes: 1,
      completedNotes: 0,
      failedNotes: 1,
      lastError: 'Qdrant unavailable',
      noteStatuses: [
        expect.objectContaining({
          noteId: 1,
          phase: 'failed',
          error: 'Qdrant unavailable'
        })
      ]
    })
  })
})
