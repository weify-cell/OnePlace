import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../database/index.js', async () => {
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '新对话',
      model TEXT NOT NULL DEFAULT 'qwen-turbo',
      provider TEXT NOT NULL DEFAULT 'qwen',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      kb_enabled INTEGER NOT NULL DEFAULT 0,
      tools_enabled INTEGER NOT NULL DEFAULT 0,
      max_tool_rounds INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tokens_used INTEGER,
      is_error INTEGER NOT NULL DEFAULT 0,
      kb_citations TEXT,
      tool_calls TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      description TEXT NOT NULL DEFAULT ''
    );
  `)
  return { connectDatabase: () => db }
})

// 只替换重依赖：回合接缝的 runAgentTurn 与提示词拼装
vi.mock('../services/ai/agent-turn.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/ai/agent-turn.js')>()),
  runAgentTurn: vi.fn(async () => '助手回复')
}))
vi.mock('../services/ai/prompt.js', () => ({
  buildSystemPrompt: vi.fn(async () => '系统提示词')
}))

import { connectDatabase } from '../database/index.js'
import { streamChat } from '../services/chat.service.js'
import { runAgentTurn } from '../services/ai/agent-turn.js'

/** 最小可用的 SSE 响应替身 */
function makeRes() {
  return {
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn()
  } as never
}

function seedConversation(): number {
  const db = connectDatabase()
  db.prepare('DELETE FROM messages').run()
  db.prepare('DELETE FROM conversations').run()
  const result = db.prepare("INSERT INTO conversations (title) VALUES ('t')").run()
  return Number(result.lastInsertRowid)
}

/** 取本轮交给回合接缝的历史内容 */
function historyPassedToTurn(callIndex = 0): string[] {
  const opts = vi.mocked(runAgentTurn).mock.calls[callIndex][0] as unknown as { history?: () => Array<{ content: string }> }
  return (opts.history?.() ?? []).map(m => m.content)
}

beforeEach(() => {
  vi.mocked(runAgentTurn).mockClear()
  vi.mocked(runAgentTurn).mockResolvedValue('助手回复')
})

describe('streamChat 的历史装配', () => {
  it('首次回合：历史为空——本轮提问由 prompt() 追加，不能同时出现在历史里', async () => {
    const conversationId = seedConversation()
    await streamChat(conversationId, '第一问', makeRes())

    expect(historyPassedToTurn()).toEqual([])
    const opts = vi.mocked(runAgentTurn).mock.calls[0][0] as unknown as { userContent: string }
    expect(opts.userContent).toBe('第一问')
  })

  it('服务重启后重建 agent：历史含旧消息，但不含本轮提问（回归：曾重复提问）', async () => {
    const conversationId = seedConversation()
    const db = connectDatabase()
    db.prepare("INSERT INTO messages (conversation_id, role, content, id) VALUES (?, 'user', '旧问', 1), (?, 'assistant', '旧答', 2)")
      .run(conversationId, conversationId)

    await streamChat(conversationId, '新问', makeRes())

    expect(historyPassedToTurn()).toEqual(['旧问', '旧答'])
  })

  it('历史按写入顺序（同毫秒时以 id 为稳定次序）', async () => {
    const conversationId = seedConversation()
    const db = connectDatabase()
    const same = '2026-09-15T00:00:00.000Z'
    db.prepare("INSERT INTO messages (conversation_id, role, content, id, created_at) VALUES (?, 'user', 'a', 1, ?), (?, 'assistant', 'b', 2, ?), (?, 'user', 'c', 3, ?)")
      .run(conversationId, same, conversationId, same, conversationId, same)

    await streamChat(conversationId, 'd', makeRes())
    expect(historyPassedToTurn()).toEqual(['a', 'b', 'c'])
  })

  it('本轮提问与回复都会落库（历史装配不影响持久化）', async () => {
    const conversationId = seedConversation()
    await streamChat(conversationId, '问', makeRes())

    const rows = connectDatabase().prepare(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id'
    ).all(conversationId)
    expect(rows).toEqual([
      { role: 'user', content: '问' },
      { role: 'assistant', content: '助手回复' }
    ])
  })
})
