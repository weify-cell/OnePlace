import { defineStore } from 'pinia'
import { chatApi } from '@/api/chat.api'
import type { Conversation, Message } from '@/types'

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const currentConversation = ref<Conversation | null>(null)
  const messages = ref<Message[]>([])
  const streamingMessage = ref('')
  const isStreaming = ref(false)
  const abortController = ref<AbortController | null>(null)

  async function fetchConversations() {
    const res = await chatApi.getConversations()
    conversations.value = res.data
  }

  async function createConversation(data?: Partial<Conversation>) {
    const res = await chatApi.createConversation(data)
    conversations.value.unshift(res.data)
    return res.data
  }

  async function selectConversation(conv: Conversation) {
    currentConversation.value = conv
    const res = await chatApi.getMessages(conv.id)
    messages.value = res.data
  }

  async function sendMessage(content: string) {
    if (!currentConversation.value || isStreaming.value) return

    const userMessage: Message = {
      id: Date.now(),
      conversation_id: currentConversation.value.id,
      role: 'user',
      content,
      tokens_used: null,
      is_error: false,
      created_at: new Date().toISOString()
    }
    messages.value.push(userMessage)
    streamingMessage.value = ''
    isStreaming.value = true

    const controller = new AbortController()
    abortController.value = controller

    try {
      const token = localStorage.getItem('oneplace_token')
      const response = await fetch(`/api/conversations/${currentConversation.value.id}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ content }),
        signal: controller.signal
      })

      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          const lines = part.split('\n')
          let event = ''
          let data = ''
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7).trim()
            if (line.startsWith('data: ')) data = line.slice(6).trim()
          }
          if (event && data) {
            try {
              const parsed = JSON.parse(data)
              if (event === 'delta') {
                streamingMessage.value += parsed.content || ''
              } else if (event === 'done') {
                const assistantMessage: Message = {
                  id: parsed.messageId,
                  conversation_id: currentConversation.value!.id,
                  role: 'assistant',
                  content: parsed.content || streamingMessage.value,
                  tokens_used: parsed.tokensUsed,
                  is_error: false,
                  created_at: new Date().toISOString()
                }
                messages.value.push(assistantMessage)
                streamingMessage.value = ''
                // Refresh conversations to update title/order
                await fetchConversations()
              } else if (event === 'error') {
                console.error('Stream error event:', parsed)
                streamingMessage.value = ''
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Stream error:', err)
      }
      streamingMessage.value = ''
    } finally {
      isStreaming.value = false
      abortController.value = null
    }
  }

  function cancelStream() {
    abortController.value?.abort()
    isStreaming.value = false
    streamingMessage.value = ''
  }

  async function deleteConversation(id: number) {
    await chatApi.deleteConversation(id)
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (currentConversation.value?.id === id) {
      currentConversation.value = null
      messages.value = []
    }
  }

  async function clearMessages(conversationId: number) {
    await chatApi.clearMessages(conversationId)
    if (currentConversation.value?.id === conversationId) {
      messages.value = []
    }
  }

  return { conversations, currentConversation, messages, streamingMessage, isStreaming, fetchConversations, createConversation, selectConversation, sendMessage, cancelStream, deleteConversation, clearMessages }
})
