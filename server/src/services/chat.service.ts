import { Response } from 'express'
import { connectDatabase } from '../database/index.js'
import { createAIClient } from './ai/openai-client.js'
import { getSettingValue } from './settings.service.js'

interface ConversationRow {
  id: number; title: string; model: string; provider: string; is_deleted: number; created_at: string; updated_at: string
}
interface MessageRow {
  id: number; conversation_id: number; role: string; content: string; tokens_used: number | null; is_error: number; created_at: string
}

function rowToConversation(row: ConversationRow) {
  return { ...row, is_deleted: row.is_deleted === 1 }
}

function rowToMessage(row: MessageRow) {
  return { ...row, is_error: row.is_error === 1 }
}

export function getConversations() {
  const db = connectDatabase()
  return (db.prepare('SELECT * FROM conversations WHERE is_deleted = 0 ORDER BY updated_at DESC').all() as ConversationRow[]).map(rowToConversation)
}

export function createConversation(data?: { title?: string; model?: string; provider?: string }) {
  const db = connectDatabase()
  const defaultModel = getSettingValue<string>('default_model', 'qwen-turbo')
  const defaultProvider = getSettingValue<string>('default_provider', 'qwen')
  const result = db.prepare('INSERT INTO conversations (title, model, provider) VALUES (?, ?, ?)').run(
    data?.title || '新对话', data?.model || defaultModel, data?.provider || defaultProvider
  )
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid) as ConversationRow
}

export function getConversationById(id: number) {
  const db = connectDatabase()
  const row = db.prepare('SELECT * FROM conversations WHERE id = ? AND is_deleted = 0').get(id) as ConversationRow | undefined
  return row ? rowToConversation(row) : null
}

export function updateConversation(id: number, data: { title?: string; model?: string; provider?: string }) {
  const db = connectDatabase()
  const updates: string[] = []
  const params: (string | number)[] = []
  if (data.title !== undefined) { updates.push('title = ?'); params.push(data.title) }
  if (data.model !== undefined) { updates.push('model = ?'); params.push(data.model) }
  if (data.provider !== undefined) { updates.push('provider = ?'); params.push(data.provider) }
  if (updates.length === 0) return getConversationById(id)
  updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
  params.push(id)
  db.prepare(`UPDATE conversations SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  return getConversationById(id)
}

export function deleteConversation(id: number): boolean {
  const db = connectDatabase()
  const result = db.prepare("UPDATE conversations SET is_deleted = 1 WHERE id = ? AND is_deleted = 0").run(id)
  return result.changes > 0
}

export function getMessages(conversationId: number) {
  const db = connectDatabase()
  return (db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId) as MessageRow[]).map(rowToMessage)
}

export function clearMessages(conversationId: number): void {
  const db = connectDatabase()
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId)
}

export async function streamChat(
  conversationId: number,
  userContent: string,
  res: Response
): Promise<void> {
  const db = connectDatabase()
  const conversation = getConversationById(conversationId)
  if (!conversation) throw new Error('Conversation not found')

  // Save user message
  const userMsgResult = db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conversationId, 'user', userContent)
  const userMessageId = userMsgResult.lastInsertRowid as number

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  // Save assistant message placeholder
  const assistantMsgResult = db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(conversationId, 'assistant', '')
  const assistantMessageId = assistantMsgResult.lastInsertRowid as number

  function writeSSE(event: string, data: unknown) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  writeSSE('start', { messageId: assistantMessageId, conversationId, userMessageId })

  try {
    const { client } = createAIClient(conversation.provider)

    // Get conversation history
    const messages = (db.prepare('SELECT role, content FROM messages WHERE conversation_id = ? AND is_error = 0 ORDER BY created_at ASC').all(conversationId) as { role: string; content: string }[])
      .filter(m => m.content.trim().length > 0) // exclude the empty assistant placeholder we just inserted

    const stream = await client.chat.completions.create({
      model: conversation.model,
      messages: messages as { role: 'user' | 'assistant' | 'system'; content: string }[],
      stream: true
    })

    let fullContent = ''
    let tokensUsed: number | null = null

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || ''
      if (delta) {
        fullContent += delta
        writeSSE('delta', { content: delta })
      }
      if (chunk.usage) {
        tokensUsed = chunk.usage.total_tokens
      }
    }

    // Update assistant message with full content
    db.prepare("UPDATE messages SET content = ?, tokens_used = ? WHERE id = ?")
      .run(fullContent, tokensUsed, assistantMessageId)

    // Update conversation title if it's "新对话" and this is first exchange
    const msgCount = (db.prepare('SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?').get(conversationId) as { c: number }).c
    if (conversation.title === '新对话' && msgCount <= 3) {
      const title = userContent.slice(0, 30)
      db.prepare("UPDATE conversations SET title = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(title, conversationId)
    } else {
      db.prepare("UPDATE conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(conversationId)
    }

    writeSSE('done', { messageId: assistantMessageId, tokensUsed, content: fullContent })
  } catch (error) {
    const errMsg = (error as Error).message
    db.prepare('UPDATE messages SET content = ?, is_error = 1 WHERE id = ?').run(`Error: ${errMsg}`, assistantMessageId)
    writeSSE('error', { code: 'AI_ERROR', message: errMsg })
  }

  res.end()
}
