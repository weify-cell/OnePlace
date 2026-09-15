import { Response } from 'express'
import { connectDatabase } from '../database/index.js'
import { runAgentTurn, webAgentId } from './ai/agent-turn.js'
import { buildSystemPrompt } from './ai/prompt.js'
import { getSettingValue } from './settings.service.js'
import type { ChatMessage } from './ai/pi-ai.adapter.js'

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

/**
 * 读该对话的历史消息（按写入顺序，id 作为同毫秒的稳定次序）。
 * 必须在写入本轮提问之前调用（见 streamChat 开头注释）。
 */
function loadHistory(conversationId: number): Array<{ role: string; content: string }> {
  const db = connectDatabase()
  return db.prepare(
    'SELECT role, content FROM messages WHERE conversation_id = ? AND is_error = 0 ORDER BY created_at ASC, id ASC'
  ).all(conversationId) as Array<{ role: string; content: string }>
}

export async function streamChat(
  conversationId: number,
  userContent: string,
  res: Response
): Promise<void> {
  const db = connectDatabase()
  const conversation = getConversationById(conversationId)
  if (!conversation) throw new Error('Conversation not found')

  // 先读历史（此刻还不含本轮提问），再写入本轮提问。
  // 顺序不能倒：agent 首次创建（含服务重启后重建）时，历史会作为初始 messages 注入，
  // 而本问随后由 prompt() 追加；若历史里已含本问，模型就会收到重复提问。
  const historyRows = loadHistory(conversationId)

  const userMsgResult = db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)')
    .run(conversationId, 'user', userContent)
  const userMessageId = userMsgResult.lastInsertRowid as number

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  function writeSSE(event: string, data: unknown) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  writeSSE('start', { messageId: 0, conversationId, userMessageId })

  try {
    // 提示词拼装与回合执行都走 ai/ 的共享接缝（与微信层同构）
    const systemPrompt = await buildSystemPrompt({
      kind: 'web-chat',
      toolsEnabled: conversation.kb_enabled || conversation.tools_enabled
    })

    const assistantContent = await runAgentTurn({
      agentId: webAgentId(conversationId),
      systemPrompt,
      userContent,
      // 历史在本轮提问落库前就已读取（见函数开头），因此不含本问；
      // 转成 pi-ai 消息形状由回合接缝内部完成
      history: () => historyRows as ChatMessage[],
      provider: conversation.provider,
      model: conversation.model
    })

    const assistantMsgResult = db.prepare(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
    ).run(conversationId, 'assistant', assistantContent)
    const assistantMessageId = assistantMsgResult.lastInsertRowid as number

    const msgCount = (db.prepare('SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?').get(conversationId) as { c: number }).c
    if (conversation.title === '新对话' && msgCount <= 2) {
      const title = userContent.slice(0, 30)
      db.prepare("UPDATE conversations SET title = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(title, conversationId)
    } else {
      db.prepare("UPDATE conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(conversationId)
    }

    writeSSE('done', {
      messageId: assistantMessageId,
      tokensUsed: null,
      content: assistantContent,
      kbCitations: [],
      toolCalls: [],
      stopReason: 'stop',
    })
  } catch (error) {
    const err = error as Error
    console.error('[chat] streamChat error:', err.message)
    writeSSE('error', { code: 'AI_ERROR', message: err.message })
  }

  res.end()
}
