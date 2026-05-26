import { getSettingValue } from '../settings.service.js'

const VECTOR_SIZE = 1536
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

export async function ensureCollection(): Promise<void> {
  const collection = getCollectionName()
  const collections = await request<{ collections: { name: string }[] }>('GET', '/collections')
  const exists = collections.collections.some((c) => c.name === collection)
  if (exists) return

  await request('PUT', `/collections/${collection}`, {
    vectors: {
      size: VECTOR_SIZE,
      distance: DISTANCE,
    },
  })
}

export async function upsertChunks(chunks: Array<{ id: string; vector: number[]; content: string; metadata?: Record<string, unknown> }>): Promise<UpsertResult> {
  if (chunks.length === 0) return { success: true, count: 0 }

  const collection = getCollectionName()
  const points: QdrantPoint[] = chunks.map((c) => ({
    id: c.id,
    vector: c.vector,
    payload: { content: c.content, ...c.metadata },
  }))

  await request('PUT', `/collections/${collection}/points`, { points })
  return { success: true, count: chunks.length }
}

export async function searchChunks(queryVector: number[], topK: number): Promise<SearchResult[]> {
  const collection = getCollectionName()
  const res = await request<{ results: Array<{ id: { uuid: string }; score: number; payload: Record<string, unknown> }> }>('POST', `/collections/${collection}/points/search`, {
    vector: queryVector,
    limit: topK,
  })

  return res.results.map((r) => ({
    id: r.id.uuid,
    score: r.score,
    payload: r.payload,
  }))
}

export async function deleteChunks(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const collection = getCollectionName()
  await request('POST', `/collections/${collection}/points/delete`, { points: ids })
}