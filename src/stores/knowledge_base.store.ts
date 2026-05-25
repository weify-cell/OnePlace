import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import { useSettingsStore } from './settings.store'

export const useKnowledgeBaseStore = defineStore('knowledgeBase', () => {
  const enabled = ref(false)
  const documents = ref<{ id: number; source_type: string; source_id: number; text: string }[]>([])
  const isLoading = ref(false)
  const isRebuilding = ref(false)

  const settingsStore = useSettingsStore()

  async function loadConfig() {
    const res = await axios.get('/api/knowledge-base/config')
    enabled.value = res.data.enabled
  }

  async function updateConfig(config: { enabled?: boolean; provider?: string; model?: string }) {
    await axios.put('/api/knowledge-base/config', config)
    if (config.enabled !== undefined) enabled.value = config.enabled
  }

  async function loadDocuments() {
    isLoading.value = true
    try {
      const res = await axios.get('/api/knowledge-base/documents')
      documents.value = res.data
    } finally {
      isLoading.value = false
    }
  }

  async function deleteDocument(id: number) {
    await axios.delete(`/api/knowledge-base/documents/${id}`)
    documents.value = documents.value.filter(d => d.id !== id)
  }

  async function rebuildIndex() {
    isRebuilding.value = true
    try {
      await axios.post('/api/knowledge-base/rebuild')
    } finally {
      isRebuilding.value = false
    }
  }

  async function search(query: string, limit = 5) {
    const res = await axios.post('/api/knowledge-base/search', { query, limit })
    return res.data
  }

  // Trigger embedding when note is updated
  function enqueueNoteEmbedding(noteId: number) {
    // This is called from note store after save
    if (enabled.value) {
      axios.post('/api/knowledge-base/trigger', { source_type: 'note', source_id: noteId }).catch(console.error)
    }
  }

  return {
    enabled,
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