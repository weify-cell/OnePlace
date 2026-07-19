import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'

export type KnowledgeBaseRebuildPhase = 'idle' | 'preparing' | 'embedding' | 'completed' | 'failed'
export type KnowledgeBaseRebuildNotePhase = 'pending' | 'running' | 'completed' | 'failed'

export interface KnowledgeBaseRebuildNoteStatus {
  noteId: number
  noteTitle: string
  phase: KnowledgeBaseRebuildNotePhase
  currentChunk: number
  totalChunks: number
  error: string | null
}

export interface KnowledgeBaseRebuildStatus {
  running: boolean
  phase: KnowledgeBaseRebuildPhase
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

export type NoteEmbeddingPhase = 'idle' | 'preparing' | 'embedding' | 'completed' | 'failed'

export interface NoteEmbeddingStatus {
  noteId: number
  noteTitle: string | null
  running: boolean
  phase: NoteEmbeddingPhase
  currentChunk: number
  totalChunks: number
  startedAt: string | null
  finishedAt: string | null
  lastError: string | null
}

export const useKnowledgeBaseStore = defineStore('knowledgeBase', () => {
  const rebuildStatus = ref<KnowledgeBaseRebuildStatus>({
    running: false,
    phase: 'idle',
    totalNotes: 0,
    completedNotes: 0,
    failedNotes: 0,
    currentNoteId: null as number | null,
    currentNoteTitle: null as string | null,
    currentChunk: 0,
    currentChunkTotal: 0,
    startedAt: null as string | null,
    finishedAt: null as string | null,
    lastError: null as string | null,
    noteStatuses: []
  })
  const enabled = ref(false)
  const config = ref({
    qdrant_url: 'http://localhost:6333',
    qdrant_collection: 'notes_knowledge_base',
    kb_chunk_size: 500,
    kb_chunk_overlap: 50,
    embedding_provider: 'qwen',
    embedding_model: 'text-embedding-v4',
    embedding_api_key: '',
    embedding_base_url: '',
    rerank_provider: 'qwen',
    rerank_model: 'qwen3-rerank',
    rerank_api_key: '',
    rerank_base_url: '',
    kb_top_k: 20,
    kb_rerank_recall_size: 5,
    kb_score_threshold: 0
  })
  const documents = ref<{ id: number; source_type: string; source_id: number; text: string }[]>([])
  const isLoading = ref(false)
  const isRebuilding = ref(false)
  const noteEmbeddingStatuses = ref<Record<number, NoteEmbeddingStatus>>({})

  async function loadConfig() {
    const res = await api.get('/knowledge-base/config')
    const data = res.data
    enabled.value = data.kb_enabled
    config.value = {
      qdrant_url: data.qdrant_url || 'http://localhost:6333',
      qdrant_collection: data.qdrant_collection || 'notes_knowledge_base',
      kb_chunk_size: data.kb_chunk_size || 500,
      kb_chunk_overlap: data.kb_chunk_overlap || 50,
      embedding_provider: data.embedding_provider || 'qwen',
      embedding_model: data.embedding_model || 'text-embedding-v4',
      embedding_api_key: data.embedding_api_key || '',
      embedding_base_url: data.embedding_base_url || '',
      rerank_provider: data.rerank_provider || 'qwen',
      rerank_model: data.rerank_model || 'qwen3-rerank',
      rerank_api_key: data.rerank_api_key || '',
      rerank_base_url: data.rerank_base_url || '',
      kb_top_k: data.kb_top_k || 20,
      kb_rerank_recall_size: data.kb_rerank_recall_size || 5,
      kb_score_threshold: data.kb_score_threshold ?? 0
    }
  }

  async function updateConfig(payload: { enabled?: boolean; provider?: string; model?: string; embedding_provider?: string; embedding_model?: string; rerank_provider?: string; rerank_model?: string; kb_top_k?: number; kb_rerank_recall_size?: number; kb_score_threshold?: number }) {
    await api.put('/knowledge-base/config', payload)
    if (payload.enabled !== undefined) enabled.value = payload.enabled
    if (payload.embedding_provider !== undefined) config.value.embedding_provider = payload.embedding_provider
    if (payload.embedding_model !== undefined) config.value.embedding_model = payload.embedding_model
    if (payload.rerank_provider !== undefined) config.value.rerank_provider = payload.rerank_provider
    if (payload.rerank_model !== undefined) config.value.rerank_model = payload.rerank_model
    if (payload.kb_top_k !== undefined) config.value.kb_top_k = payload.kb_top_k
    if (payload.kb_rerank_recall_size !== undefined) config.value.kb_rerank_recall_size = payload.kb_rerank_recall_size
    if (payload.kb_score_threshold !== undefined) config.value.kb_score_threshold = payload.kb_score_threshold
  }

  async function loadDocuments() {
    isLoading.value = true
    try {
      const res = await api.get('/knowledge-base/documents')
      documents.value = res.data
    } finally {
      isLoading.value = false
    }
  }

  async function deleteDocument(id: number) {
    await api.delete(`/knowledge-base/documents/${id}`)
    documents.value = documents.value.filter(d => d.id !== id)
  }

  async function rebuildIndex() {
    isRebuilding.value = true
    try {
      const res = await api.post('/knowledge-base/rebuild')
      if (res.data?.status) {
        rebuildStatus.value = res.data.status
      }
      return res.data
    } finally {
      isRebuilding.value = false
    }
  }

  async function fetchRebuildStatus() {
    const res = await api.get('/knowledge-base/rebuild-status')
    rebuildStatus.value = res.data
    return rebuildStatus.value
  }

  async function search(query: string, limit = 5) {
    const res = await api.post('/knowledge-base/search', { query, limit })
    return res.data
  }

  // Trigger embedding when note is updated
  async function triggerNoteEmbedding(noteId: number) {
    const res = await api.post('/knowledge-base/trigger', { source_type: 'note', source_id: noteId })
    if (res.data?.status) {
      noteEmbeddingStatuses.value[noteId] = res.data.status
    }
    return res.data?.status as NoteEmbeddingStatus | undefined
  }

  async function fetchNoteEmbeddingStatus(noteId: number) {
    const res = await api.get(`/knowledge-base/note-status/${noteId}`)
    noteEmbeddingStatuses.value[noteId] = res.data
    return res.data as NoteEmbeddingStatus
  }

  function getNoteEmbeddingStatus(noteId: number): NoteEmbeddingStatus {
    return noteEmbeddingStatuses.value[noteId] || {
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

  function enqueueNoteEmbedding(noteId: number) {
    if (enabled.value) {
      return triggerNoteEmbedding(noteId).catch(console.error)
    }
  }

  return {
    enabled,
    config,
    documents,
    isLoading,
    isRebuilding,
    rebuildStatus,
    noteEmbeddingStatuses,
    loadConfig,
    updateConfig,
    loadDocuments,
    deleteDocument,
    rebuildIndex,
    fetchRebuildStatus,
    search,
    enqueueNoteEmbedding,
    triggerNoteEmbedding,
    fetchNoteEmbeddingStatus,
    getNoteEmbeddingStatus
  }
})
