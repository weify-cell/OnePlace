// src/api/knowledge-base.api.ts
import type { AxiosPromise } from 'axios'
import { api } from './index'

export interface KnowledgeBaseSettings {
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

export interface KnowledgeBaseStats {
  points_count: number
}

export const knowledgeBaseApi = {
  getSettings(): AxiosPromise<{ data: KnowledgeBaseSettings }> {
    return api.get('/knowledge-base/settings')
  },

  updateSettings(settings: Partial<KnowledgeBaseSettings>): AxiosPromise<{ data: string }> {
    return api.put('/knowledge-base/settings', settings)
  },

  rebuild(): AxiosPromise<{ data: { message: string } }> {
    return api.post('/knowledge-base/rebuild')
  },

  getStats(): AxiosPromise<{ data: KnowledgeBaseStats }> {
    return api.get('/knowledge-base/stats')
  },
}
