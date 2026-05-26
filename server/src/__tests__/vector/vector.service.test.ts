import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ensureCollection, upsertChunks, searchChunks, deleteChunks } from '../../services/vector/vector.service.js'

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock settings service
vi.mock('../services/settings.service.js', () => ({
  getSettingValue: vi.fn((key: string, defaultValue: string) => {
    if (key === 'qdrant_url') return 'http://localhost:6333'
    if (key === 'qdrant_collection') return 'notes_knowledge_base'
    return defaultValue
  }),
}))

beforeEach(() => {
  mockFetch.mockReset()
})

describe('vector.service', () => {
  describe('ensureCollection', () => {
    it('should not create collection if it already exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ collections: [{ name: 'notes_knowledge_base' }] }),
      })

      await ensureCollection()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:6333/collections', expect.any(Object))
    })

    it('should create collection if it does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ collections: [] }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: true }),
      })

      await ensureCollection()

      expect(mockFetch).toHaveBeenCalledTimes(2)
      const createCall = mockFetch.mock.calls[1]
      expect(createCall[0]).toBe('http://localhost:6333/collections/notes_knowledge_base')
      expect(createCall[1].body).toContain('"vectors"')
    })
  })

  describe('upsertChunks', () => {
    it('should return success with count 0 for empty chunks', async () => {
      const result = await upsertChunks([])
      expect(result).toEqual({ success: true, count: 0 })
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should upsert chunks to Qdrant', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: true }),
      })

      const chunks = [
        { id: 'chunk-1', vector: [0.1, 0.2], content: 'hello world' },
        { id: 'chunk-2', vector: [0.3, 0.4], content: 'goodbye world' },
      ]

      const result = await upsertChunks(chunks)

      expect(result).toEqual({ success: true, count: 2 })
      expect(mockFetch).toHaveBeenCalledTimes(1)
      const call = mockFetch.mock.calls[0]
      expect(call[0]).toBe('http://localhost:6333/collections/notes_knowledge_base/points')
      const body = JSON.parse(call[1].body as string)
      expect(body.points).toHaveLength(2)
      expect(body.points[0].id).toBe('chunk-1')
      expect(body.points[0].payload.content).toBe('hello world')
    })
  })

  describe('searchChunks', () => {
    it('should search and return formatted results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              { id: { uuid: 'chunk-1' }, score: 0.95, payload: { content: 'hello' } },
              { id: { uuid: 'chunk-2' }, score: 0.88, payload: { content: 'world' } },
            ],
          }),
      })

      const results = await searchChunks([0.1, 0.2], 5)

      expect(results).toHaveLength(2)
      expect(results[0]).toEqual({ id: 'chunk-1', score: 0.95, payload: { content: 'hello' } })
      expect(results[1]).toEqual({ id: 'chunk-2', score: 0.88, payload: { content: 'world' } })
    })
  })

  describe('deleteChunks', () => {
    it('should do nothing for empty ids', async () => {
      await deleteChunks([])
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should delete chunks by ids', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: true }),
      })

      await deleteChunks(['chunk-1', 'chunk-2'])

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const call = mockFetch.mock.calls[0]
      expect(call[0]).toBe('http://localhost:6333/collections/notes_knowledge_base/points/delete')
      const body = JSON.parse(call[1].body as string)
      expect(body.points).toEqual(['chunk-1', 'chunk-2'])
    })
  })
})