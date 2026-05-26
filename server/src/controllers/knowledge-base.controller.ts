import { Request, Response } from 'express'
import * as kbService from '../services/knowledge-base.service.js'
import * as settingsService from '../services/settings.service.js'

export function getConfig(req: Request, res: Response): void {
  const config = kbService.getKnowledgeBaseConfig()
  res.json(config)
}

export function updateConfig(req: Request, res: Response): void {
  const fields: Record<string, unknown> = req.body
  for (const [key, value] of Object.entries(fields)) {
    settingsService.setSetting(key, value)
  }
  const config = kbService.getKnowledgeBaseConfig()
  res.json(config)
}

export function rebuildIndex(req: Request, res: Response): void {
  // Async operation, don't block
  res.json({ message: 'Rebuild started' })
  kbService.rebuildAllIndex().catch((e) => {
    console.error('[kb] rebuildAllIndex failed:', e)
  })
}

export function triggerEmbedding(req: Request, res: Response): void {
  const { source_type, source_id } = req.body
  const noteId = Number(source_id)
  if (!source_type || !source_id || isNaN(noteId)) {
    res.status(400).json({ error: 'source_type and source_id are required' })
    return
  }
  kbService.triggerEmbedding(noteId)
  res.json({ message: 'Embedding triggered', note_id: noteId })
}

export async function deleteDocument(req: Request, res: Response): Promise<void> {
  const { id } = req.params
  const { deleteChunks } = await import('../services/vector/vector.service.js')
  await deleteChunks([id])
  res.json({ message: 'Document deleted', id })
}