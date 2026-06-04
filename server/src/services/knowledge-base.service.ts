import { embedText } from './ai/embedding-client.js'
import { rerankTextWithFallback } from './ai/rerank-client.js'
import { upsertChunks, searchChunks } from './vector/vector.service.js'
import { getSettingValue } from './settings.service.js'
import type { Note } from './notes.service.js'

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

async function triggerEmbedding(noteId: number): Promise<void> {
  // Lazy import to avoid circular dependency
  const { getNoteById } = await import('./notes.service.js')
  const note = getNoteById(noteId)
  if (!note) return

  const kbEnabled = getSettingValue<boolean>('kb_enabled', false)
  if (!kbEnabled) return

  const config = getKnowledgeBaseConfig()
  if (!config.qdrant_url || !config.qdrant_collection) return

  if (!note.is_knowledge_base) {
    // Delete from Qdrant
    const { deleteChunksByNoteId } = await import('./vector/vector.service.js')
    await deleteChunksByNoteId(noteId)
    return
  }

  // Build full text: title + content_text
  const fullText = `${note.title}\n${note.content_text || ''}`.trim()
  if (!fullText) return

  const chunks = splitIntoChunks(fullText, config.kb_chunk_size, config.kb_chunk_overlap)
  if (chunks.length === 0) return

  // Embed all chunks
  const { embedText } = await import('./ai/embedding-client.js')
  const vectors = await Promise.all(chunks.map(chunk => embedText(chunk, config.embedding_provider, config.embedding_model)))

  const { upsertChunks } = await import('./vector/vector.service.js')
  // Use numeric ID: noteId * 10000 + i to match existing data pattern
  await upsertChunks(chunks.map((content, i) => ({
    id: String(noteId * 10000 + i),
    vector: vectors[i],
    content,
    metadata: { note_id: noteId, chunk_index: i, title: note.title }
  })))
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
  // Lazy import to avoid circular dependency
  const { getNotes } = await import('./notes.service.js')
  let page = 1
  const pageSize = 50
  let total = 0
  let succeeded = 0
  let failed = 0

  while (true) {
    const { items } = getNotes({ is_archived: false, page, pageSize })
    if (items.length === 0) break

    const kbNotes = items.filter((n: Note) => n.is_knowledge_base)
    total += kbNotes.length

    for (const note of kbNotes) {
      try {
        await triggerEmbedding(note.id)
        succeeded++
      } catch (e) {
        console.error(`[kb] Failed to index note ${note.id}:`, e)
        failed++
      }
    }

    page++
  }

  return { total, succeeded, failed }
}

export { triggerEmbedding, searchKnowledgeBase, getKnowledgeBaseConfig, rebuildAllIndex }