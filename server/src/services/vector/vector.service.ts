import { getSettingValue } from '../settings.service.js'

const VECTOR_SIZE = 1024
const DISTANCE = 'Cosine'

interface QdrantPoint {
  id: string
  vector: number[]
  payload: Record<string, unknown>
}

interface UpsertResult {
  success: boolean
  count?: number
  error?: string
}

interface SearchResult {
  id: string
  score: number
  payload: Record<string, unknown>
}

function normalizePointId(id: unknown): string {
  if (typeof id === 'string' || typeof id === 'number') {
    return String(id)
  }
  if (id && typeof id === 'object' && 'uuid' in id) {
    return String((id as { uuid: string }).uuid)
  }
  return String(id)
}

export function getQdrantUrl(): string {
  return getSettingValue<string>('qdrant_url', 'http://localhost:6333')
}

export function getCollectionName(): string {
  return getSettingValue<string>('qdrant_collection', 'oneplace')
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${getQdrantUrl()}${path}`
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Qdrant ${method} ${path} failed: ${res.status} ${text}`)
  }
  return res.json() as Promise<T>
}

function isMissingCollectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.message.includes('failed: 404')
}

export async function ensureCollection(): Promise<void> {
  const collection = getCollectionName()
  const res = await request<{ result: { collections: { name: string }[] } }>('GET', '/collections')
  const exists = res.result.collections.some((c) => c.name === collection)
  if (exists) return

  await request('PUT', `/collections/${collection}`, {
    vectors: {
      size: VECTOR_SIZE,
      distance: DISTANCE,
    },
  })
}

export async function upsertChunks(chunks: Array<{ id: string; vector: number[]; content: string; metadata?: Record<string, unknown> }>): Promise<UpsertResult> {
  await ensureCollection()
  if (chunks.length === 0) return { success: true, count: 0 }

  const collection = getCollectionName()
  const points: Array<{ id: number | string; vector: number[]; payload: Record<string, unknown> }> = chunks.map((c) => ({
    id: /^\d+$/.test(c.id) ? Number(c.id) : c.id,
    vector: c.vector,
    payload: { content: c.content, ...c.metadata },
  }))

  try {
    await request('PUT', `/collections/${collection}/points`, { points })
    return { success: true, count: chunks.length }
  } catch (err) {
    console.error('[vector] upsertChunks failed:', err)
    return { success: false, error: (err as Error).message }
  }
}

export async function searchChunks(queryVector: number[], topK: number): Promise<SearchResult[]> {
  const collection = getCollectionName()
  console.log(`[vector] searchChunks: collection=${collection}, vectorLen=${queryVector.length}`)
  try {
    const res = await request<{
      result?: Array<{ id: unknown; score: number; payload?: Record<string, unknown> }>
      results?: Array<{ id: unknown; score: number; payload?: Record<string, unknown> }>
      status?: string
      error?: string
    }>('POST', `/collections/${collection}/points/search`, {
      vector: queryVector,
      limit: topK,
      with_payload: true,
    })

    console.log(`[vector] searchChunks response:`, JSON.stringify(res).slice(0, 500))

    const resultItems = res.result || res.results

    if (!resultItems) {
      console.error('[vector] searchChunks: no result field, response:', res)
      return []
    }

    return resultItems.map((r) => {
      console.log(`[vector] point id=${r.id}, score=${r.score}, payload=`, JSON.stringify(r.payload).slice(0, 200))
      return {
        id: normalizePointId(r.id),
        score: r.score,
        payload: r.payload || {},
      }
    })
  } catch (err) {
    console.error('[vector] searchChunks failed:', err)
    throw err
  }
}

export async function deleteChunks(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const collection = getCollectionName()
  const normalized = ids.map(id => /^\d+$/.test(id) ? Number(id) : id)
  await request('POST', `/collections/${collection}/points/delete`, { points: normalized })
}

export async function deleteChunksByNoteId(noteId: number): Promise<void> {
  const collection = getCollectionName()
  // Scroll to find all points with matching note_id in payload
  let offset: string | undefined
  const idsToDelete: string[] = []
  try {
    while (true) {
      const res = await request<{
        points?: Array<{ id: number | string }>
        next_page_offset?: string
        result?: {
          points?: Array<{ id: number | string }>
          next_page_offset?: string
        }
      }>('POST', `/collections/${collection}/points/scroll`, {
        filter: { must: [{ key: 'note_id', match: { value: noteId } }] },
        limit: 100,
        offset,
        with_payload: false,
      })
      const points = res.points || res.result?.points || []
      const nextPageOffset = res.next_page_offset || res.result?.next_page_offset
      idsToDelete.push(...points.map(p => String(p.id)))
      if (!nextPageOffset) break
      offset = nextPageOffset
    }
  } catch (error) {
    if (isMissingCollectionError(error)) {
      return
    }
    throw error
  }
  if (idsToDelete.length > 0) {
    await deleteChunks(idsToDelete)
  }
}
