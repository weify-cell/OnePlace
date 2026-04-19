import { Request, Response } from 'express'
import * as chatService from '../services/chat.service.js'

export function getConversations(req: Request, res: Response): void {
  res.json(chatService.getConversations())
}

export function createConversation(req: Request, res: Response): void {
  const conv = chatService.createConversation(req.body)
  res.status(201).json(conv)
}

export function getConversation(req: Request, res: Response): void {
  const conv = chatService.getConversationById(Number(req.params.id))
  if (!conv) { res.status(404).json({ error: 'NotFound' }); return }
  res.json(conv)
}

export function updateConversation(req: Request, res: Response): void {
  try {
    const conv = chatService.updateConversation(Number(req.params.id), req.body)
    if (!conv) { res.status(404).json({ error: 'NotFound', message: '对话不存在' }); return }
    res.json(conv)
  } catch (err: any) {
    console.error('[Chat] updateConversation error:', err)
    res.status(500).json({ error: 'UpdateFailed', message: err.message || '更新对话失败' })
  }
}

export function deleteConversation(req: Request, res: Response): void {
  const deleted = chatService.deleteConversation(Number(req.params.id))
  if (!deleted) { res.status(404).json({ error: 'NotFound' }); return }
  res.status(204).send()
}

export function getMessages(req: Request, res: Response): void {
  res.json(chatService.getMessages(Number(req.params.id)))
}

export function clearMessages(req: Request, res: Response): void {
  chatService.clearMessages(Number(req.params.id))
  res.status(204).send()
}

export async function streamChat(req: Request, res: Response): Promise<void> {
  const { content } = req.body
  if (!content) { res.status(400).json({ error: 'BadRequest', message: '消息内容不能为空' }); return }
  await chatService.streamChat(Number(req.params.id), content, res)
}
