import { api } from './index'
import type { Conversation, Message } from '@/types'

export const chatApi = {
  getConversations: () => api.get<Conversation[]>('/conversations'),
  createConversation: (data?: Partial<Conversation>) => api.post<Conversation>('/conversations', data),
  updateConversation: (id: number, data: Partial<Conversation>) => api.patch<Conversation>(`/conversations/${id}`, data),
  deleteConversation: (id: number) => api.delete(`/conversations/${id}`),
  getMessages: (id: number) => api.get<Message[]>(`/conversations/${id}/messages`),
  clearMessages: (id: number) => api.delete(`/conversations/${id}/messages`)
}
