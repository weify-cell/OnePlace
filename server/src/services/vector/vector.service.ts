import { getSettingValue } from '../settings.service.js'

export interface ChunkPayload {
  chunk_id: string
  note_id: number
  title: string
  content: string
  tags: string[]
  folder_id: number | null
  created_at: string
}

export interface SearchResult {
  chunk_id: string
  note_id: number
  title: string
  content: string
  tags: string[]
  score: number
}

function getQdrantConfig() {
  return {
    url: getSettingValue<string>('qdrant_url', 'http://localhost:6333'),
    collection: getSettingValue<string>('qdrant_collection', 'notes_knowledge_base'),
  }
}

async function qdrantRequest(path: string, method = 'GET', body?: unknown) {
  const { url } = getQdrantConfig()
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Qdrant ${method} ${path} failed: ${res.status} ${text}`)
  }
  return res.json()
}

export async function upsertChunks(chunks: { id: string; vector: number[]; payload: ChunkPayload }[]): Promise<void> {
  if (chunks.length === 0) return
  const { collection } = getQdrantConfig()
  // 每10个一组提交
  for (let i = 0; i < chunks.length; i += 9) {
    const batch = chunks.slice(i, i + 9)
    await qdrantRequest(`/collections/${collection}/points`, 'PUT', {
      points: batch.map(c => ({
        id: c.id,
        vector: c.vector,
        payload: c.payload,
      }))
    })
  }
  
}

export async function searchChunks(queryVector: number[], topK: number): Promise<SearchResult[]> {
  const { collection } = getQdrantConfig()
  const result = await qdrantRequest(`/collections/${collection}/points/search`, 'POST', {
    vector: queryVector,
    limit: topK,
    with_payload: true,
  })
  return (result.result || []).map((r: any) => ({
    chunk_id: r.payload.chunk_id,
    note_id: r.payload.note_id,
    title: r.payload.title,
    content: r.payload.content,
    tags: r.payload.tags || [],
    score: r.score,
  }))
}

export async function deleteChunksByNoteId(noteId: number): Promise<void> {
  const { collection } = getQdrantConfig()
  await qdrantRequest(`/collections/${collection}/points/delete`, 'POST', {
    filter: {
      must: [{ key: 'note_id', match: { value: noteId } }]
    }
  })
}

export async function createCollectionIfNotExists(dimension: number): Promise<boolean> {
  const { collection } = getQdrantConfig()

  // Check if collection already exists
  const exists = await qdrantRequest(`/collections/${collection}`).then(() => true).catch((e) => {
    if (e.message.includes('404')) return false
    throw e
  })

  if (exists) return true

  // Create collection using PUT (Qdrant 1.7+ API)
  try {
    await qdrantRequest(`/collections/${collection}`, 'PUT', {
      vectors: {
        size: dimension,
        distance: 'Cosine'
      }
    })
    return true
  } catch {
    return false
  }
}

export async function deleteCollection(): Promise<void> {
  const { collection } = getQdrantConfig()
  try {
    await qdrantRequest(`/collections/${collection}`, 'DELETE')
  } catch {
    // collection may not exist
  }
}

export async function getCollectionInfo(): Promise<{ points_count: number }> {
  const { collection } = getQdrantConfig()
  try {
    const info = await qdrantRequest(`/collections/${collection}`)
    return { points_count: info.result?.points_count || 0 }
  } catch {
    return { points_count: 0 }
  }
}
