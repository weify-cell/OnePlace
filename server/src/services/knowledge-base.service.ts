import { embedText } from './ai/embedding-client.js'
import { searchChunks } from './vector/vector.service.js'
import { getSettingValue, setSetting } from './settings.service.js'
import { getConversationById } from './chat.service.js'

// Note: MessageReference type is shared via JSON serialization between backend and frontend
// Backend serializes this as plain object in SSE response

export interface KnowledgeBaseContext {
  systemPrompt: string
  references: MessageReference[]
}

export interface MessageReference {
  note_id: number
  title: string
  content: string
  score: number
}

export async function buildKnowledgeBaseContext(
  conversationId: number,
  userQuery: string
): Promise<KnowledgeBaseContext | null> {
  const conversation = getConversationById(conversationId)
  if (!conversation || !(conversation as any).kb_enabled) {
    return null
  }

  const enabled = getSettingValue<boolean>('kb_enabled', false)
  if (!enabled) return null

  const provider = getSettingValue<string>('embedding_provider', 'qwen')
  const model = getSettingValue<string>('embedding_model', 'text-embedding-v2')
  const topK = getSettingValue<number>('kb_top_k', 5)

  try {
    const [queryVector] = await Promise.all([embedText(userQuery, provider, model)])
    const chunks = await searchChunks(queryVector, topK)

    if (chunks.length === 0) {
      return { systemPrompt: '', references: [] }
    }

    // Deduplicate by note_id, keep highest score chunk per note
    const noteMap = new Map<number, MessageReference>()
    for (const chunk of chunks) {
      const existing = noteMap.get(chunk.note_id)
      if (!existing || chunk.score > existing.score) {
        noteMap.set(chunk.note_id, {
          note_id: chunk.note_id,
          title: chunk.title,
          content: chunk.content,
          score: chunk.score,
        })
      }
    }
    const references = Array.from(noteMap.values())

    const refTexts = references.map((r, i) => `[${i+1}] ${r.title}: ${r.content}`).join('\n\n')
    const systemPrompt = [
      'You are an assistant. When the user asks a question, please answer based on the provided reference notes.',
      'If the reference content does not contain relevant information, please say so honestly.',
      '',
      '## References',
      refTexts,
      '',
      '## Requirements',
      '- Answer based on the reference content above',
      '- If multiple notes are relevant, synthesize them',
      '- If you cannot answer from the references, say "I cannot answer this based on the current knowledge base"',
      '',
      '## Notes',
      '- Your answers should cite relevant note content as evidence',
      '- If multiple notes cover the same topic, synthesize the answers',
    ].join('\n')

    return { systemPrompt, references }
  } catch (e) {
    console.error('[knowledge-base] Failed to build context:', e)
    return null
  }
}

export interface KnowledgeBaseConfig {
  kb_enabled: boolean
  embedding_provider: string
  embedding_api_key: string
  embedding_model: string
  qdrant_url: string
  qdrant_collection: string
  kb_top_k: number
  kb_chunk_size: number
  kb_chunk_overlap: number
  kb_default_enabled: boolean
}

export function getKnowledgeBaseConfig(): Partial<KnowledgeBaseConfig> {
  return {
    kb_enabled: getSettingValue<boolean>('kb_enabled', false),
    embedding_provider: getSettingValue<string>('embedding_provider', 'qwen'),
    embedding_model: getSettingValue<string>('embedding_model', 'text-embedding-v2'),
    qdrant_url: getSettingValue<string>('qdrant_url', 'http://localhost:6333'),
    qdrant_collection: getSettingValue<string>('qdrant_collection', 'notes_knowledge_base'),
    kb_top_k: getSettingValue<number>('kb_top_k', 5),
    kb_chunk_size: getSettingValue<number>('kb_chunk_size', 500),
    kb_chunk_overlap: getSettingValue<number>('kb_chunk_overlap', 50),
    kb_default_enabled: getSettingValue<boolean>('kb_default_enabled', false),
  }
}

export async function saveKnowledgeBaseConfig(config: Partial<KnowledgeBaseConfig>): Promise<void> {
  if (config.kb_enabled !== undefined) setSetting('kb_enabled', config.kb_enabled)
  if (config.embedding_provider !== undefined) setSetting('embedding_provider', config.embedding_provider)
  if (config.embedding_model !== undefined) setSetting('embedding_model', config.embedding_model)
  if (config.qdrant_url !== undefined) setSetting('qdrant_url', config.qdrant_url)
  if (config.qdrant_collection !== undefined) setSetting('qdrant_collection', config.qdrant_collection)
  if (config.kb_top_k !== undefined) setSetting('kb_top_k', config.kb_top_k)
  if (config.kb_chunk_size !== undefined) setSetting('kb_chunk_size', config.kb_chunk_size)
  if (config.kb_chunk_overlap !== undefined) setSetting('kb_chunk_overlap', config.kb_chunk_overlap)
  if (config.kb_default_enabled !== undefined) setSetting('kb_default_enabled', config.kb_default_enabled)
}
