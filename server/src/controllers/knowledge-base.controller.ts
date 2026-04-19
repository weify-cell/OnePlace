import { Request, Response } from 'express'
import { getKnowledgeBaseConfig, saveKnowledgeBaseConfig } from '../services/knowledge-base.service.js'
import { getCollectionInfo, deleteCollection, createCollectionIfNotExists } from '../services/vector/vector.service.js'
import { getEmbeddingDimension } from '../services/ai/embedding-client.js'
import { getSettingValue } from '../services/settings.service.js'
import { getNotes } from '../services/notes.service.js'
import { enqueueEmbeddingTask } from '../services/vector/embedding-queue.js'

export async function getKnowledgeBaseSettings(req: Request, res: Response) {
  try {
    const config = getKnowledgeBaseConfig()
    res.json({ data: { ...config, embedding_api_key: config.embedding_api_key ? '******' : '' } })
  } catch (err: any) {
    console.error('[KnowledgeBase] getSettings error:', err)
    res.status(500).json({ error: 'GetSettingsFailed', message: `获取知识库设置失败: ${err.message}` })
  }
}

export async function updateKnowledgeBaseSettings(req: Request, res: Response) {
  try {
    const config = req.body
    await saveKnowledgeBaseConfig(config)
    res.json({ data: 'ok' })
  } catch (err: any) {
    console.error('[KnowledgeBase] updateSettings error:', err)
    res.status(500).json({ error: 'UpdateSettingsFailed', message: `更新知识库设置失败: ${err.message}` })
  }
}

export async function rebuildIndex(req: Request, res: Response) {
  try {
    res.json({ data: { message: 'Index rebuild started' } })

    const provider = getSettingValue<string>('embedding_provider', 'qwen')
    const model = getSettingValue<string>('embedding_model', 'text-embedding-v2')
    const dimension = getEmbeddingDimension(provider, model)

    await deleteCollection()
    await createCollectionIfNotExists(dimension)

    let page = 1
    const pageSize = 50
    while (true) {
      const { items } = getNotes({ page, pageSize, is_archived: false })
      if (items.length === 0) break
      for (const note of items) {
        enqueueEmbeddingTask({ noteId: note.id, action: 'upsert', timestamp: Date.now() })
      }
      page++
      if (items.length < pageSize) break
    }
  } catch (err) {
    console.error('[KnowledgeBase] rebuildIndex error:', err)
    // Already sent response, cannot send error response
  }
}

export async function getKnowledgeBaseStats(req: Request, res: Response) {
  try {
    const info = await getCollectionInfo()
    res.json({ data: { points_count: info.points_count } })
  } catch (err: any) {
    console.error('[KnowledgeBase] getStats error:', err)
    res.status(503).json({ error: 'ServiceUnavailable', message: `知识库服务不可用: ${err.message || 'Qdrant 连接失败'}` })
  }
}
