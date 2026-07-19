import { Router } from 'express'
import * as kbController from '../controllers/knowledge-base.controller.js'

export const kbRouter = Router()

kbRouter.get('/config', kbController.getConfig)
kbRouter.get('/rebuild-status', kbController.getRebuildStatus)
kbRouter.get('/note-status/:noteId', kbController.getNoteEmbeddingStatus)
kbRouter.put('/config', kbController.updateConfig)
kbRouter.post('/rebuild', kbController.rebuildIndex)
kbRouter.post('/trigger', kbController.triggerEmbedding)
kbRouter.delete('/documents/:id', kbController.deleteDocument)
