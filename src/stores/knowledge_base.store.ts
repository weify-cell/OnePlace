import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'

export const useKnowledgeBaseStore = defineStore('knowledgeBase', () => {
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

  async function updateConfig(config: { enabled?: boolean; provider?: string; model?: string; embedding_provider?: string; embedding_model?: string; rerank_provider?: string; rerank_model?: string; kb_top_k?: number; kb_rerank_recall_size?: number; kb_score_threshold?: number }) {
    await api.put('/knowledge-base/config', config)
    if (config.enabled !== undefined) enabled.value = config.enabled
    if (config.embedding_provider !== undefined) config.value.embedding_provider = config.embedding_provider
    if (config.embedding_model !== undefined) config.value.embedding_model = config.embedding_model
    if (config.rerank_provider !== undefined) config.value.rerank_provider = config.rerank_provider
    if (config.rerank_model !== undefined) config.value.rerank_model = config.rerank_model
    if (config.kb_top_k !== undefined) config.value.kb_top_k = config.kb_top_k
    if (config.kb_rerank_recall_size !== undefined) config.value.kb_rerank_recall_size = config.kb_rerank_recall_size
    if (config.kb_score_threshold !== undefined) config.value.kb_score_threshold = config.kb_score_threshold
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
      await api.post('/knowledge-base/rebuild')
    } finally {
      isRebuilding.value = false
    }
  }

  async function search(query: string, limit = 5) {
    const res = await api.post('/knowledge-base/search', { query, limit })
    return res.data
  }

  // Trigger embedding when note is updated
  function enqueueNoteEmbedding(noteId: number) {
    // This is called from note store after save
    if (enabled.value) {
      api.post('/knowledge-base/trigger', { source_type: 'note', source_id: noteId }).catch(console.error)
    }
  }

  return {
    enabled,
    config,
    documents,
    isLoading,
    isRebuilding,
    loadConfig,
    updateConfig,
    loadDocuments,
    deleteDocument,
    rebuildIndex,
    search,
    enqueueNoteEmbedding
  }
})