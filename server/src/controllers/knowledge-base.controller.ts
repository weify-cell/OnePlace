import { Request, Response } from 'express'
import * as kbService from '../services/knowledge-base.service.js'
import * as settingsService from '../services/settings.service.js'

export function getConfig(req: Request, res: Response): void {
  const config = kbService.getKnowledgeBaseConfig()
  const aiProviders = settingsService.getSettingValue<Record<string, { apiKey?: string; baseURL?: string }>>('ai_providers', {})

  // Always read from 'embedding' and 'rerank' keys (set by updateConfig)
  const emb = aiProviders['embedding'] || aiProviders[config.embedding_provider] || {}
  const rer = aiProviders['rerank'] || aiProviders[config.rerank_provider] || {}

  res.json({
    ...config,
    embedding_api_key: emb.apiKey || '',
    embedding_base_url: emb.baseURL || '',
    rerank_api_key: rer.apiKey || '',
    rerank_base_url: rer.baseURL || ''
  })
}

export function updateConfig(req: Request, res: Response): void {
  const fields: Record<string, unknown> = req.body

  // Always load existing ai_providers first
  const aiProviders = settingsService.getSettingValue<Record<string, { apiKey?: string; baseURL?: string }>>('ai_providers', {})

  const embProviderKey = (fields.embedding_provider as string) || 'qwen'
  const rerankProviderKey = (fields.rerank_provider as string) || 'qwen'

  // Save embedding api key - store under both provider name AND 'embedding' key
  if (fields.embedding_api_key !== undefined || fields.embedding_base_url !== undefined) {
    const embData = {
      apiKey: (fields.embedding_api_key as string) || '',
      baseURL: (fields.embedding_base_url as string) || ''
    }
    // Write to both keys for reliable lookup
    aiProviders[embProviderKey] = embData
    aiProviders['embedding'] = embData
  }

  // Save rerank api key - store under both provider name AND 'rerank' key
  if (fields.rerank_api_key !== undefined || fields.rerank_base_url !== undefined) {
    const rerData = {
      apiKey: (fields.rerank_api_key as string) || '',
      baseURL: (fields.rerank_base_url as string) || ''
    }
    aiProviders[rerankProviderKey] = rerData
    aiProviders['rerank'] = rerData
  }

  // Save ai_providers if embedding/rerank keys changed
  if (fields.embedding_api_key !== undefined || fields.embedding_base_url !== undefined ||
      fields.rerank_api_key !== undefined || fields.rerank_base_url !== undefined) {
    settingsService.setSetting('ai_providers', aiProviders)
  }

  // Save other KB config fields
  const kbFields = ['embedding_provider', 'embedding_model', 'kb_rerank_provider', 'kb_rerank_model',
    'kb_top_k', 'kb_rerank_recall_size', 'kb_score_threshold', 'qdrant_url', 'qdrant_collection', 'kb_chunk_size', 'kb_chunk_overlap']
  for (const [key, value] of Object.entries(fields)) {
    if (kbFields.includes(key)) {
      settingsService.setSetting(key, value)
    }
  }

  const config = kbService.getKnowledgeBaseConfig()
  res.json(config)
}

export function rebuildIndex(req: Request, res: Response): void {
  const status = kbService.getRebuildStatus()
  if (!status.running) {
    kbService.rebuildAllIndex().catch((e) => {
      console.error('[kb] rebuildAllIndex failed:', e)
    })
  }

  res.json({
    message: status.running ? 'Rebuild already running' : 'Rebuild started',
    status: kbService.getRebuildStatus()
  })
}

export function getRebuildStatus(req: Request, res: Response): void {
  res.json(kbService.getRebuildStatus())
}

export function triggerEmbedding(req: Request, res: Response): void {
  const { source_type, source_id } = req.body
  const noteId = Number(source_id)
  if (!source_type || !source_id || isNaN(noteId)) {
    res.status(400).json({ error: 'source_type and source_id are required' })
    return
  }
  kbService.triggerEmbedding(noteId).catch(console.error)
  res.json({ message: 'Embedding triggered', note_id: noteId, status: kbService.getNoteEmbeddingStatus(noteId) })
}

export function getNoteEmbeddingStatus(req: Request, res: Response): void {
  const noteId = Number(req.params.noteId)
  if (isNaN(noteId)) {
    res.status(400).json({ error: 'Valid noteId is required' })
    return
  }
  res.json(kbService.getNoteEmbeddingStatus(noteId))
}

export async function deleteDocument(req: Request, res: Response): Promise<void> {
  const { id } = req.params
  const { deleteChunks } = await import('../services/vector/vector.service.js')
  const ids = Array.isArray(id) ? id : [id]
  await deleteChunks(ids)
  res.json({ message: 'Document deleted', id })
}
