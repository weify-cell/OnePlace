import { Response } from 'express'
import { connectDatabase } from '../database/index.js'
import { streamChatWithPi } from './ai/pi-ai.adapter.js'
import { getSettingValue } from './settings.service.js'
import { DEFAULT_NOTE_TOOLS_PROMPT, DEFAULT_CHAT_SYSTEM_PROMPT } from './prompt-defaults.js'

interface ConversationRow {
  id: number
  title: string
  model: string
  provider: string
  is_deleted: number
  kb_enabled: number
  tools_enabled: number
  max_tool_rounds: number
  created_at: string
  updated_at: string
}

interface MessageRow {
  id: number
  conversation_id: number
  role: string
  content: string
  tokens_used: number | null
  is_error: number
  kb_citations: string | null
  tool_calls: string | null
  created_at: string
}

function rowToConversation(row: ConversationRow) {
  return {
    ...row,
    is_deleted: row.is_deleted === 1,
    kb_enabled: row.kb_enabled === 1,
    tools_enabled: row.tools_enabled === 1
  }
}

function rowToMessage(row: MessageRow) {
  return {
    ...row,
    is_error: row.is_error === 1,
    kb_citations: row.kb_citations ? JSON.parse(row.kb_citations) : null,
    tool_calls: row.tool_calls ? JSON.parse(row.tool_calls) : null
  }
}

export function getConversations() {
  const db = connectDatabase()
  return (db.prepare('SELECT * FROM conversations WHERE is_deleted = 0 ORDER BY updated_at DESC').all() as ConversationRow[])
    .map(rowToConversation)
}

export function createConversation(data?: {
  title?: string
  model?: string
  provider?: string
  tools_enabled?: boolean
  kb_enabled?: boolean
}) {
  const db = connectDatabase()
  const defaultModel = getSettingValue<string>('default_model', 'qwen-turbo')
  const defaultProvider = getSettingValue<string>('default_provider', 'qwen')
  const result = db.prepare(
    'INSERT INTO conversations (title, model, provider, tools_enabled, kb_enabled) VALUES (?, ?, ?, ?, ?)'
  ).run(
    data?.title || '新对话',
    data?.model || defaultModel,
    data?.provider || defaultProvider,
    data?.tools_enabled ? 1 : 0,
    data?.kb_enabled ? 1 : 0
  )
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(result.lastInsertRowid) as ConversationRow
}

export function getConversationById(id: number) {
  const db = connectDatabase()
  const row = db.prepare('SELECT * FROM conversations WHERE id = ? AND is_deleted = 0').get(id) as ConversationRow | undefined
  return row ? rowToConversation(row) : null
}

export function updateConversation(id: number, data: {
  title?: string
  model?: string
  provider?: string
  kb_enabled?: boolean
  tools_enabled?: boolean
  max_tool_rounds?: number
}) {
  const db = connectDatabase()
  const updates: string[] = []
  const params: (string | number)[] = []

  if (data.title !== undefined) { updates.push('title = ?'); params.push(data.title) }
  if (data.model !== undefined) { updates.push('model = ?'); params.push(data.model) }
  if (data.provider !== undefined) { updates.push('provider = ?'); params.push(data.provider) }
  if (data.kb_enabled !== undefined) { updates.push('kb_enabled = ?'); params.push(data.kb_enabled ? 1 : 0) }
  if (data.tools_enabled !== undefined) { updates.push('tools_enabled = ?'); params.push(data.tools_enabled ? 1 : 0) }
  if (data.max_tool_rounds !== undefined) { updates.push('max_tool_rounds = ?'); params.push(data.max_tool_rounds) }
  if (updates.length === 0) return getConversationById(id)

  updates.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
  params.push(id)
  db.prepare(`UPDATE conversations SET ${updates.join(', ')} WHERE id = ?`).run(...params)
  return getConversationById(id)
}

export function deleteConversation(id: number): boolean {
  const db = connectDatabase()
  const result = db.prepare('UPDATE conversations SET is_deleted = 1 WHERE id = ? AND is_deleted = 0').run(id)
  return result.changes > 0
}

export function getMessages(conversationId: number) {
  const db = connectDatabase()
  return (db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId) as MessageRow[])
    .map(rowToMessage)
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

  const userMsgResult = db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)')
    .run(conversationId, 'user', userContent)
  const userMessageId = userMsgResult.lastInsertRowid as number

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const assistantMsgResult = db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)')
    .run(conversationId, 'assistant', '')
  const assistantMessageId = assistantMsgResult.lastInsertRowid as number

  function writeSSE(event: string, data: unknown) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  writeSSE('start', { messageId: assistantMessageId, conversationId, userMessageId })

  try {
    const messages = (db.prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? AND is_error = 0 ORDER BY created_at ASC'
    ).all(conversationId) as { role: string; content: string }[]).filter(m => m.content.trim().length > 0)

    const systemPrompt = (conversation.kb_enabled || conversation.tools_enabled)
      ? getSettingValue<string>('note_tools_prompt', DEFAULT_NOTE_TOOLS_PROMPT)
      : DEFAULT_CHAT_SYSTEM_PROMPT

    const result = await streamChatWithPi(
      conversation.provider,
      conversation.model,
      messages as { role: 'user' | 'assistant' | 'system'; content: string }[],
      systemPrompt,
      {
        onStart: () => {},
        onTextStart: () => {},
        onDelta: (content) => {
          writeSSE('delta', { content })
        },
        onThinkingStart: () => {
          writeSSE('thinking_start', {})
        },
        onThinkingDelta: (content) => {
          writeSSE('thinking_delta', { content })
        },
        onThinkingEnd: (content) => {
          writeSSE('thinking_end', { content })
        },
        onToolCallStart: (toolCall) => {
          writeSSE('tool_call', { id: toolCall.id, name: toolCall.name, arguments: toolCall.arguments, status: 'running' })
        },
        onToolCallDelta: (name, partialArgs) => {
          writeSSE('tool_call_delta', { name, partialArgs })
        },
        onToolCallEnd: (toolCall) => {
          writeSSE('tool_call', { id: toolCall.id, name: toolCall.name, arguments: toolCall.arguments, status: 'completed' })
        },
        onToolResult: (record) => {
          writeSSE('tool_result', record)
        },
        onRoundEnd: () => {},
        onDone: () => {},
        onError: (error) => {
          throw error
        }
      },
      {
        toolsEnabled: conversation.tools_enabled || conversation.kb_enabled,
        maxRounds: conversation.max_tool_rounds
      }
    )

    const toolCallsJson = result.toolCallRecords.length > 0 ? JSON.stringify(result.toolCallRecords) : null

    db.prepare('UPDATE messages SET content = ?, tokens_used = ?, tool_calls = ? WHERE id = ?').run(
      result.content,
      result.tokensUsed,
      toolCallsJson,
      assistantMessageId
    )

    const msgCount = (db.prepare('SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?').get(conversationId) as { c: number }).c
    if (conversation.title === '新对话' && msgCount <= 3) {
      const title = userContent.slice(0, 30)
      db.prepare("UPDATE conversations SET title = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
        .run(title, conversationId)
    } else {
      db.prepare("UPDATE conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?")
        .run(conversationId)
    }

    const kbCitationsFromTools: Array<{ note_id: number; title: string; content: string; score: number }> = []

    console.log(`[chat] done: content=${result.content.length}c, tokens=${result.tokensUsed}, tools=${result.toolCallRecords.length}, stopReason=${result.stopReason}`)
    writeSSE('done', {
      messageId: assistantMessageId,
      tokensUsed: result.tokensUsed,
      content: result.content,
      kbCitations: kbCitationsFromTools,
      toolCalls: result.toolCallRecords,
      stopReason: result.stopReason
    })
  } catch (error) {
    const err = error as Error
    console.error('[chat] streamChat error:', err.message, err.stack)
    const errMsg = err.message || 'Unknown error'
    db.prepare('UPDATE messages SET content = ?, is_error = 1 WHERE id = ?').run(`Error: ${errMsg}`, assistantMessageId)
    writeSSE('error', { code: 'AI_ERROR', message: errMsg })
  }

  res.end()
}
