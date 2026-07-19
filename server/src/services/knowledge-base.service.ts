import { embedText } from './ai/embedding-client.js'
import { rerankTextWithFallback } from './ai/rerank-client.js'
import { upsertChunks, searchChunks } from './vector/vector.service.js'
import { getSettingValue } from './settings.service.js'
import type { Note } from './notes.service.js'
import { extractFullPlainText } from './note-text.service.js'

export interface KnowledgeBaseRebuildStatus {
  running: boolean
  phase: 'idle' | 'preparing' | 'embedding' | 'completed' | 'failed'
  totalNotes: number
  completedNotes: number
  failedNotes: number
  currentNoteId: number | null
  currentNoteTitle: string | null
  currentChunk: number
  currentChunkTotal: number
  startedAt: string | null
  finishedAt: string | null
  lastError: string | null
  noteStatuses: KnowledgeBaseRebuildNoteStatus[]
}

export interface KnowledgeBaseRebuildNoteStatus {
  noteId: number
  noteTitle: string
  phase: 'pending' | 'running' | 'completed' | 'failed'
  currentChunk: number
  totalChunks: number
  error: string | null
}

export interface NoteEmbeddingStatus {
  noteId: number
  noteTitle: string | null
  running: boolean
  phase: 'idle' | 'preparing' | 'embedding' | 'completed' | 'failed'
  currentChunk: number
  totalChunks: number
  startedAt: string | null
  finishedAt: string | null
  lastError: string | null
}

let rebuildStatus: KnowledgeBaseRebuildStatus = {
  running: false,
  phase: 'idle',
  totalNotes: 0,
  completedNotes: 0,
  failedNotes: 0,
  currentNoteId: null,
  currentNoteTitle: null,
  currentChunk: 0,
  currentChunkTotal: 0,
  startedAt: null,
  finishedAt: null,
  lastError: null,
  noteStatuses: []
}

let rebuildPromise: Promise<{ total: number; succeeded: number; failed: number }> | null = null
const noteEmbeddingStatuses = new Map<number, NoteEmbeddingStatus>()
const noteEmbeddingPromises = new Map<number, Promise<void>>()

function updateRebuildStatus(patch: Partial<KnowledgeBaseRebuildStatus>): void {
  rebuildStatus = { ...rebuildStatus, ...patch }
}

function resetRebuildStatus(): void {
  rebuildStatus = {
    running: true,
    phase: 'preparing',
    totalNotes: 0,
    completedNotes: 0,
    failedNotes: 0,
    currentNoteId: null,
    currentNoteTitle: null,
    currentChunk: 0,
    currentChunkTotal: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    lastError: null,
    noteStatuses: []
  }
}

function createDefaultNoteEmbeddingStatus(noteId: number): NoteEmbeddingStatus {
  return {
    noteId,
    noteTitle: null,
    running: false,
    phase: 'idle',
    currentChunk: 0,
    totalChunks: 0,
    startedAt: null,
    finishedAt: null,
    lastError: null
  }
}

function updateNoteEmbeddingStatus(noteId: number, patch: Partial<NoteEmbeddingStatus>): void {
  const current = noteEmbeddingStatuses.get(noteId) || createDefaultNoteEmbeddingStatus(noteId)
  noteEmbeddingStatuses.set(noteId, { ...current, ...patch })
}

function splitIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  if (text.length === 0) return []
  const targetTokens = chunkSize
  const safeOverlap = Math.max(0, Math.min(overlap, chunkSize - 1))
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = start + 1
    let tokenCount = 0
    while (end <= text.length && tokenCount < targetTokens) {
      const char = text[end - 1]
      if (char.charCodeAt(0) > 127) {
        tokenCount += 1.3
      } else {
        tokenCount += 0.25
      }
      end++
    }
    if (tokenCount > targetTokens && end > start + 1) {
      end--
    }
    chunks.push(text.slice(start, end))
    if (end >= text.length) break
    const nextStart = end - safeOverlap
    start = nextStart > start ? nextStart : end
  }

  return chunks.filter(c => c.length > 0)
}

async function embedChunksSerially(
  chunks: string[],
  provider: string,
  model: string,
  onProgress?: (completed: number, total: number) => void
): Promise<number[][]> {
  const vectors: number[][] = []

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const vector = await embedText(chunk, provider, model)
    vectors.push(vector)
    onProgress?.(i + 1, chunks.length)

    if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
      console.log(`[knowledge-base] embedded ${i + 1}/${chunks.length} chunks`)
    }
  }

  return vectors
}

async function triggerEmbedding(
  noteId: number,
  options?: { onProgress?: (completed: number, total: number) => void }
): Promise<void> {
  const existingPromise = noteEmbeddingPromises.get(noteId)
  if (existingPromise) return existingPromise

  updateNoteEmbeddingStatus(noteId, {
    running: true,
    phase: 'preparing',
    currentChunk: 0,
    totalChunks: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    lastError: null
  })

  const job = (async () => {
  // Lazy import to avoid circular dependency
    const { getNoteById } = await import('./notes.service.js')
    const note = getNoteById(noteId)
    if (!note) {
      throw new Error(`Note ${noteId} not found`)
    }

    updateNoteEmbeddingStatus(noteId, { noteTitle: note.title })

    const config = getKnowledgeBaseConfig()
    if (!config.qdrant_url || !config.qdrant_collection) {
      throw new Error('Knowledge base is not configured')
    }

    if (!note.is_knowledge_base) {
      const { deleteChunksByNoteId } = await import('./vector/vector.service.js')
      await deleteChunksByNoteId(noteId)
      updateNoteEmbeddingStatus(noteId, {
        noteTitle: note.title,
        running: false,
        phase: 'completed',
        finishedAt: new Date().toISOString(),
        currentChunk: 0,
        totalChunks: 0
      })
      return
    }

    const fullText = `${note.title}\n${extractFullPlainText(note.content, note.content_format)}`.trim()
    if (!fullText) {
      updateNoteEmbeddingStatus(noteId, {
        noteTitle: note.title,
        running: false,
        phase: 'completed',
        finishedAt: new Date().toISOString(),
        currentChunk: 0,
        totalChunks: 0
      })
      return
    }

    const chunks = splitIntoChunks(fullText, config.kb_chunk_size, config.kb_chunk_overlap)
    if (chunks.length === 0) {
      updateNoteEmbeddingStatus(noteId, {
        noteTitle: note.title,
        running: false,
        phase: 'completed',
        finishedAt: new Date().toISOString(),
        currentChunk: 0,
        totalChunks: 0
      })
      return
    }

    updateNoteEmbeddingStatus(noteId, {
      noteTitle: note.title,
      phase: 'embedding',
      totalChunks: chunks.length
    })

    const vectors = await embedChunksSerially(
      chunks,
      config.embedding_provider,
      config.embedding_model,
      (completed, total) => {
        updateNoteEmbeddingStatus(noteId, {
          phase: 'embedding',
          currentChunk: completed,
          totalChunks: total
        })
        options?.onProgress?.(completed, total)
      }
    )

    const { upsertChunks } = await import('./vector/vector.service.js')
    const result = await upsertChunks(chunks.map((content, i) => ({
      id: String(noteId * 10000 + i),
      vector: vectors[i],
      content,
      metadata: { note_id: noteId, chunk_index: i, title: note.title }
    })))

    if (!result.success) {
      throw new Error(result.error || `Failed to upsert ${chunks.length} chunks`)
    }

    updateNoteEmbeddingStatus(noteId, {
      noteTitle: note.title,
      running: false,
      phase: 'completed',
      currentChunk: chunks.length,
      totalChunks: chunks.length,
      finishedAt: new Date().toISOString()
    })
  })().catch((error) => {
    updateNoteEmbeddingStatus(noteId, {
      running: false,
      phase: 'failed',
      finishedAt: new Date().toISOString(),
      lastError: (error as Error).message
    })
    throw error
  }).finally(() => {
    noteEmbeddingPromises.delete(noteId)
  })

  noteEmbeddingPromises.set(noteId, job)
  return job
}

function getKnowledgeBaseConfig(): {
  kb_enabled: boolean
  embedding_provider: string
  embedding_model: string
  qdrant_url: string
  qdrant_collection: string
  kb_chunk_size: number
  kb_chunk_overlap: number
  rerank_provider: string
  rerank_model: string
  kb_top_k: number
  kb_rerank_top_n: number
  kb_score_threshold: number
} {
  return {
    kb_enabled: getSettingValue<boolean>('kb_enabled', false),
    embedding_provider: getSettingValue<string>('embedding_provider', 'qwen'),
    embedding_model: getSettingValue<string>('embedding_model', 'text-embedding-v4'),
    qdrant_url: getSettingValue<string>('qdrant_url', 'http://localhost:6333'),
    qdrant_collection: getSettingValue<string>('qdrant_collection', 'oneplace'),
    kb_chunk_size: getSettingValue<number>('kb_chunk_size', 500),
    kb_chunk_overlap: getSettingValue<number>('kb_chunk_overlap', 50),
    rerank_provider: getSettingValue<string>('kb_rerank_provider', 'qwen'),
    rerank_model: getSettingValue<string>('kb_rerank_model', 'qwen3-rerank'),
    kb_top_k: getSettingValue<number>('kb_top_k', 20),
    kb_rerank_top_n: getSettingValue<number>('kb_rerank_recall_size', 5),
    kb_score_threshold: getSettingValue<number>('kb_score_threshold', 0)
  }
}

async function searchKnowledgeBase(
  query: string,
  topK: number = 5
): Promise<Array<{ note_id: number; title: string; content: string; score: number }>> {
  const config = getKnowledgeBaseConfig()
  if (!config.kb_enabled) return []

  try {
    const { embedText } = await import('./ai/embedding-client.js')
    const queryVector = await embedText(query, config.embedding_provider, config.embedding_model)

    const { searchChunks } = await import('./vector/vector.service.js')
    const searchResults = await searchChunks(queryVector, config.kb_top_k)

    if (searchResults.length === 0) return []

    const docs = searchResults.map(r => r.payload.content as string || '')
    const vectorScores = searchResults.map(r => r.score)
    const rerankResults = await rerankTextWithFallback(query, docs, config.rerank_provider, config.rerank_model, vectorScores)

    const threshold = config.kb_score_threshold
    const filtered = threshold > 0
      ? rerankResults.filter(r => r.score >= threshold)
      : rerankResults

    const finalResults = filtered
      .slice(0, config.kb_rerank_top_n)
      .map(r => {
        const searchResult = searchResults[r.docIndex]
        const meta = searchResult.payload as { note_id?: number; title?: string; content?: string }
        return {
          note_id: (meta.note_id as number) || 0,
          title: (meta.title as string) || '',
          content: (meta.content as string) || '',
          score: r.score
        }
      })

    console.log(`[knowledge-base] searchKnowledgeBase: ${finalResults.length} results after rerank (threshold=${threshold})`)
    return finalResults
  } catch (err) {
    console.error('[knowledge-base] search failed:', err)
    return []
  }
}

async function rebuildAllIndex(): Promise<{ total: number; succeeded: number; failed: number }> {
  if (rebuildPromise) return rebuildPromise

  resetRebuildStatus()

  rebuildPromise = (async () => {
    // Lazy import to avoid circular dependency
    const { getNotes } = await import('./notes.service.js')

    let page = 1
    const pageSize = 50
    const kbNotes: Note[] = []

    while (true) {
      const { items } = getNotes({ is_archived: false, page, pageSize })
      if (items.length === 0) break
      kbNotes.push(...items.filter((n: Note) => n.is_knowledge_base))
      page++
    }

    updateRebuildStatus({
      phase: 'embedding',
      totalNotes: kbNotes.length,
      noteStatuses: kbNotes.map((note) => ({
        noteId: note.id,
        noteTitle: note.title,
        phase: 'pending',
        currentChunk: 0,
        totalChunks: 0,
        error: null
      }))
    })

    let succeeded = 0
    let failed = 0

    for (const note of kbNotes) {
      updateRebuildStatus({
        currentNoteId: note.id,
        currentNoteTitle: note.title,
        currentChunk: 0,
        currentChunkTotal: 0,
        noteStatuses: rebuildStatus.noteStatuses.map((item) =>
          item.noteId === note.id
            ? { ...item, phase: 'running', currentChunk: 0, totalChunks: 0, error: null }
            : item
        )
      })

      try {
        await triggerEmbedding(note.id, {
          onProgress: (completed, total) => {
            updateRebuildStatus({
              currentChunk: completed,
              currentChunkTotal: total,
              noteStatuses: rebuildStatus.noteStatuses.map((item) =>
                item.noteId === note.id
                  ? { ...item, phase: 'running', currentChunk: completed, totalChunks: total }
                  : item
              )
            })
          }
        })
        succeeded++
        updateRebuildStatus({
          completedNotes: succeeded,
          noteStatuses: rebuildStatus.noteStatuses.map((item) =>
            item.noteId === note.id
              ? {
                  ...item,
                  phase: 'completed',
                  currentChunk: item.totalChunks > 0 ? item.totalChunks : item.currentChunk,
                  totalChunks: item.totalChunks
                }
              : item
          )
        })
      } catch (e) {
        failed++
        console.error(`[kb] Failed to index note ${note.id}:`, e)
        updateRebuildStatus({
          failedNotes: failed,
          lastError: (e as Error).message,
          noteStatuses: rebuildStatus.noteStatuses.map((item) =>
            item.noteId === note.id
              ? { ...item, phase: 'failed', error: (e as Error).message }
              : item
          )
        })
      }
    }

    updateRebuildStatus({
      running: false,
      phase: failed > 0 ? 'failed' : 'completed',
      completedNotes: succeeded,
      failedNotes: failed,
      currentNoteId: null,
      currentNoteTitle: null,
      currentChunk: 0,
      currentChunkTotal: 0,
      finishedAt: new Date().toISOString()
    })

    return { total: kbNotes.length, succeeded, failed }
  })().catch((error) => {
    updateRebuildStatus({
      running: false,
      phase: 'failed',
      finishedAt: new Date().toISOString(),
      lastError: (error as Error).message
    })
    throw error
  }).finally(() => {
    rebuildPromise = null
  })

  return rebuildPromise
}

function getRebuildStatus(): KnowledgeBaseRebuildStatus {
  return {
    ...rebuildStatus,
    noteStatuses: rebuildStatus.noteStatuses.map((item) => ({ ...item }))
  }
}

function getNoteEmbeddingStatus(noteId: number): NoteEmbeddingStatus {
  const status = noteEmbeddingStatuses.get(noteId) || createDefaultNoteEmbeddingStatus(noteId)
  return { ...status }
}

export { triggerEmbedding, searchKnowledgeBase, getKnowledgeBaseConfig, rebuildAllIndex, getRebuildStatus, getNoteEmbeddingStatus }
