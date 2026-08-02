import { describe, expect, it, vi, afterEach } from 'vitest'
import { upsertChunks, searchChunks } from '../services/vector/vector.service.js'

vi.mock('../services/settings.service.js', () => ({
  getSettingValue: vi.fn((key: string, def: unknown) => {
    const map: Record<string, unknown> = {
      qdrant_url: 'http://qdrant.test:6333',
      qdrant_collection: 'oneplace',
      qdrant_memory_collection: 'oneplace_memory'
    }
    return map[key] ?? def
  })
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

afterEach(() => { fetchMock.mockReset() })

describe('upsertChunks collection 参数', () => {
  it('使用指定 collection 并携带 metadata', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { collections: [{ name: 'oneplace_memory' }] } }) }) // GET /collections
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { operation_id: 1 } }) }) // PUT points
    await upsertChunks(
      [{ id: 'mem1', vector: [0.1, 0.2], content: '用户喝美式', metadata: { memory_id: 1, user_id: 'u1', memory_date: '2026-08-01' } }],
      'oneplace_memory'
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const putUrl = String(fetchMock.mock.calls[1][0])
    expect(putUrl).toContain('/collections/oneplace_memory/points')
    const body = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(body.points[0].id).toBe('mem1')
    expect(body.points[0].payload).toMatchObject({ content: '用户喝美式', memory_id: 1, user_id: 'u1' })
  })
})

describe('searchChunks collection + filter', () => {
  it('透传 collection、filter 并映射结果', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: [{ id: 'mem1', score: 0.9, payload: { content: 'x', memory_id: 1 } }] })
    })
    const res = await searchChunks([0.1, 0.2], 5, {
      collection: 'oneplace_memory',
      filter: { must: [{ key: 'user_id', match: { value: 'u1' } }] }
    })
    const reqUrl = String(fetchMock.mock.calls[0][0])
    expect(reqUrl).toContain('/collections/oneplace_memory/points/search')
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body.filter).toEqual({ must: [{ key: 'user_id', match: { value: 'u1' } }] })
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ id: 'mem1', score: 0.9 })
  })

  it('不传 opts 时默认 collection 行为不变', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ result: [] }) })
    await searchChunks([0.1], 5)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/collections/oneplace/points/search')
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body.filter).toBeUndefined()
  })
})
