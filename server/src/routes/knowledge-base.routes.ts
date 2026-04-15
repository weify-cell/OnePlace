import { Router } from 'express'
import {
  getKnowledgeBaseSettings,
  updateKnowledgeBaseSettings,
  rebuildIndex,
  getKnowledgeBaseStats
} from '../controllers/knowledge-base.controller.js'

export const knowledgeBaseRouter = Router()

knowledgeBaseRouter.get('/settings', getKnowledgeBaseSettings)
knowledgeBaseRouter.put('/settings', updateKnowledgeBaseSettings)
knowledgeBaseRouter.post('/rebuild', rebuildIndex)
knowledgeBaseRouter.get('/stats', getKnowledgeBaseStats)
