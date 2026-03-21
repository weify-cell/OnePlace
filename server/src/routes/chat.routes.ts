import { Router } from 'express'
import * as chatController from '../controllers/chat.controller.js'

export const chatRouter = Router()

chatRouter.get('/', chatController.getConversations)
chatRouter.post('/', chatController.createConversation)
chatRouter.get('/:id', chatController.getConversation)
chatRouter.patch('/:id', chatController.updateConversation)
chatRouter.delete('/:id', chatController.deleteConversation)
chatRouter.get('/:id/messages', chatController.getMessages)
chatRouter.delete('/:id/messages', chatController.clearMessages)
chatRouter.post('/:id/chat', chatController.streamChat)
