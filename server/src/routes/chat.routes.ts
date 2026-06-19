import { Router } from 'express'
import * as chatController from '../controllers/chat.controller.js'
import * as chatService from '../services/chat.service.js'

export const chatRouter = Router()

chatRouter.get('/', chatController.getConversations)
chatRouter.post('/', chatController.createConversation)
chatRouter.get('/:id', chatController.getConversation)
chatRouter.patch('/:id', chatController.updateConversation)
chatRouter.delete('/:id', chatController.deleteConversation)
chatRouter.get('/:id/messages', chatController.getMessages)
chatRouter.delete('/:id/messages', chatController.clearMessages)
chatRouter.post('/:id/chat', chatController.streamChat)
chatRouter.patch('/:id/kb', (req, res) => {
  const { id } = req.params
  const { kb_enabled } = req.body
  const conv = chatService.updateConversation(Number(id), { kb_enabled })
  if (!conv) { res.status(404).json({ error: 'NotFound' }); return }
  res.json(conv)
})
