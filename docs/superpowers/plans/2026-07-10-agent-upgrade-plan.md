# Agent 框架升级实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 `@earendil-works/pi-agent-core` 的 `Agent` 类替换手写 agent loop，统一 bot 和聊天页的 agent 调用方式

**Architecture:** 新建 `AgentPool` 管理 Agent 实例生命周期（创建、恢复、销毁），工具改为 `AgentTool` 格式内嵌 execute，bot 和聊天页通过 `subscribe` 订阅 Agent 事件驱动消息收发

**Tech Stack:** TypeScript, @earendil-works/pi-agent-core 0.80.6, @earendil-works/pi-ai 0.80.6, better-sqlite3, Express

## 全局约束

- DB schema 不变（wechat_messages、messages 表结构无变化）
- 前端 API 契约不变（SSE 事件格式保持一致）
- 不改变 LLM 提供商配置方式（仍通过 settings 表读写）
- pi-ai 0.80.6 的 stream 从 `@earendil-works/pi-ai/api/openai-completions` 导入
- Agent 类型定义参考 `@earendil-works/pi-agent-core/dist/agent.d.ts` 和 `types.d.ts`
- AgentPool 为 map 结构，无过期淘汰
- `subscribe` 在用完后必须取消订阅（调用返回的 unsubscribe 函数）

---

### Task 1: 创建 AgentPool 类

**Files:**
- Create: `server/src/services/ai/agent-pool.ts`

**Interfaces:**
- Consumes: `Agent`, `AgentOptions`, `AgentTool`, `StreamFn` from `@earendil-works/pi-agent-core`
- Consumes: `Message`, `Model` from `@earendil-works/pi-ai`
- Produces: `AgentPool` class with `getOrCreate(id, historyLoader)` / `remove(id)` / `shutdown()`

- [ ] **Step 1: 写入 AgentPool 类**

```typescript
import type { Agent, AgentTool, StreamFn } from '@earendil-works/pi-agent-core'
import type { Message, Model } from '@earendil-works/pi-ai'

export class AgentPool {
  private agents = new Map<string, Agent>()

  constructor(
    private streamFn: StreamFn,
    private tools: AgentTool[],
    private model: Model<'openai-completions'>,
    private getApiKey: (provider: string) => string | undefined,
    private defaultSystemPrompt: string = ''
  ) {}

  getOrCreate(id: string, historyLoader: () => Message[]): Agent {
    let agent = this.agents.get(id)
    if (!agent) {
      const { Agent } = require('@earendil-works/pi-agent-core')
        as typeof import('@earendil-works/pi-agent-core')
      const history = historyLoader()
      agent = new Agent({
        streamFn: this.streamFn,
        getApiKey: this.getApiKey,
        initialState: {
          model: this.model,
          systemPrompt: this.defaultSystemPrompt,
          tools: this.tools,
          messages: history,
        },
      })
      this.agents.set(id, agent)
    }
    return agent
  }

  remove(id: string): void {
    const agent = this.agents.get(id)
    if (agent) {
      agent.abort()
      this.agents.delete(id)
    }
  }

  get(id: string): Agent | undefined {
    return this.agents.get(id)
  }

  shutdown(): void {
    for (const agent of this.agents.values()) {
      agent.abort()
    }
    this.agents.clear()
  }
}
```

- [ ] **Step 2: 类型检查**

```bash
cd server && npx tsc --noEmit
```

- [ ] **Step 3: 提交**

```bash
git add server/src/services/ai/agent-pool.ts
git commit -m "feat: 新建 AgentPool 管理 Agent 实例生命周期"
```

---

### Task 2: 工具迁移到 AgentTool 格式

**Files:**
- Modify: `server/src/services/ai/builtin-tools.ts`

**Interfaces:**
- Consumes: `AgentTool`, `AgentToolResult`, `AgentToolUpdateCallback` from `@earendil-works/pi-agent-core`
- Consumes: `TextContent`, `Type` from `@earendil-works/pi-ai`
- Produces: `getBuiltinTools(): AgentTool[]`

- [ ] **Step 1: 重写 builtin-tools.ts**

移除 `registerBuiltinTools()` 函数和 `registerTool` 调用。新增导出 `getBuiltinTools(): AgentTool[]`。

每个工具改为 `AgentTool` 格式，`execute` 内嵌。以 `list_notes` 为例：

```typescript
import { Type, type TextContent } from '@earendil-works/pi-ai'
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { getNotes, searchNoteLines, getNoteLines } from '../notes.service.js'

export function getBuiltinTools(): AgentTool[] {
  return [
    {
      name: 'list_notes',
      label: '列出笔记',
      description: '列出用户的笔记，支持按关键词、标签、文件夹筛选',
      parameters: Type.Object({
        search: Type.Optional(Type.String()),
        tag: Type.Optional(Type.String()),
        folder_id: Type.Optional(Type.Number()),
        page: Type.Optional(Type.Number({ default: 1 })),
        pageSize: Type.Optional(Type.Number({ default: 20 })),
      }),
      execute: async (_toolCallId, params): Promise<AgentToolResult<void>> => {
        const { items, total } = getNotes({
          search: params.search,
          tag: params.tag,
          folder_id: params.folder_id,
          page: params.page ?? 1,
          pageSize: params.pageSize ?? 20,
        })
        const formatted = items
          .map(note => `[${note.id}] ${note.title}`)
          .join('\n')
        return {
          content: [{ type: 'text', text: formatted || '没有找到匹配的笔记' }],
          details: undefined as void,
        }
      },
    },
    // ... 其余 12 个工具同理迁移
  ]
}
```

完整迁移的 13 个工具：`list_notes`、`search_note_lines`、`get_note_lines`、`list_folders`、`get_todo`、`create_todo`、`update_todo`、`delete_todo`、`update_todo_progress`、`get_todo_progress_logs`、`search_knowledge_base`、`get_formatted_todos`、`get_current_time`。

统一签名：
```typescript
execute: async (
  toolCallId: string,
  params: Static<TParameters>,
  signal?: AbortSignal,
  onUpdate?: AgentToolUpdateCallback<any>
): Promise<AgentToolResult<any>>
```

返回值 `{ content: [{ type: 'text', text }], details: undefined }`。错误时直接 throw。

- [ ] **Step 2: 类型检查 + 测试**

```bash
cd server && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 3: 提交**

```bash
git add server/src/services/ai/builtin-tools.ts
git commit -m "refactor: 工具迁移到 AgentTool 格式，execute 内嵌"
```

---

### Task 3: 缩减 tools.registry.ts + 注释 index.ts 调用

**Files:**
- Modify: `server/src/services/ai/tools.registry.ts`
- Modify: `server/src/index.ts`

**Interfaces:**
- 删除: `registerTool()`, `executeToolCall()`, `getToolDefinitions()`, `toolRegistry` Map
- 保留: `ToolResult`, `ToolExecutor`, `toolCallToRecord()`, `toolResultToRecord()`

- [ ] **Step 1: 删除运行时函数**

删除 `tools.registry.ts` 中的：
- 模块级 `const toolRegistry = new Map()`（第 19 行）
- `registerTool()` 函数
- `getToolDefinitions()` 函数
- `executeToolCall()` 函数

保留其余导出。

- [ ] **Step 2: 注释 index.ts 中的旧调用**

```typescript
// 旧代码注释掉
// import { registerBuiltinTools } from './services/ai/builtin-tools.js'
// registerBuiltinTools()
```

- [ ] **Step 3: 类型检查**

```bash
cd server && npx tsc --noEmit
```

- [ ] **Step 4: 提交**

```bash
git add server/src/services/ai/tools.registry.ts server/src/index.ts
git commit -m "refactor: 移除工具注册表运行时，保留序列化函数"
```

---

### Task 4: 重写 pi-ai.adapter.ts

**Files:**
- Modify: `server/src/services/ai/pi-ai.adapter.ts`

**Interfaces:**
- 删除: `streamChatWithPi()`, `processEventStream()`, 旧的 `createModel()`, 旧的 `convertMessages()`
- 新增: `createStreamFn()`, `createModel(provider, modelId)`, `convertMessages(messages)`, `ChatMessage` 接口

- [ ] **Step 1: 写入精简版**

```typescript
import { stream } from '@earendil-works/pi-ai/api/openai-completions'
import type { Model, Message, UserMessage } from '@earendil-works/pi-ai'
import type { StreamFn } from '@earendil-works/pi-agent-core'
import { getSettingValue } from '../settings.service.js'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

const BASE_URL_MAP: Record<string, string> = {
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  deepseek: 'https://api.deepseek.com/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  moonshot: 'https://api.moonshot.cn/v1',
  kimi: 'https://api.moonshot.cn/v1',
}

function getApiConfig(provider: string): { apiKey: string; baseUrl: string } {
  const providersJson = getSettingValue<string>('ai_providers', '{}')
  const providers = JSON.parse(providersJson) as Record<string, string>
  const apiKey = providers[provider] || ''
  const baseUrl = getSettingValue<string>(
    `${provider}_base_url`, BASE_URL_MAP[provider] || ''
  )
  return { apiKey, baseUrl }
}

export function createModel(
  provider: string, modelId: string
): Model<'openai-completions'> {
  const { baseUrl } = getApiConfig(provider)
  return {
    id: modelId, name: modelId, api: 'openai-completions',
    provider: provider as Model<'openai-completions'>['provider'],
    baseUrl, reasoning: false, input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000, maxTokens: 4096,
  }
}

export function createStreamFn(): StreamFn {
  return (model, context, options) => stream(model, context, options)
}

export function convertMessages(messages: ChatMessage[]): Message[] {
  return messages.map(m => {
    if (m.role === 'system') {
      return { role: 'system', content: m.content } as Message
    }
    return { role: m.role, content: m.content } as UserMessage
  })
}
```

- [ ] **Step 2: 类型检查**

```bash
cd server && npx tsc --noEmit
```

- [ ] **Step 3: 提交**

```bash
git add server/src/services/ai/pi-ai.adapter.ts
git commit -m "refactor: 重写 pi-ai.adapter，提供 createStreamFn + createModel"
```

---

### Task 5: ilink-bot.service.ts 接入 AgentPool

**Files:**
- Modify: `server/src/services/wechat/ilink-bot.service.ts`

- [ ] **Step 1: 新增导入和初始化**

在文件顶部追加导入：

```typescript
import { AgentPool } from '../ai/agent-pool.js'
import {
  createStreamFn, createModel, convertMessages, type ChatMessage
} from '../ai/pi-ai.adapter.js'
import { getBuiltinTools } from '../ai/builtin-tools.js'
```

在 `let loginStatus` 附近添加：

```typescript
let agentPool: AgentPool | null = null
```

添加初始化函数（在 `getLearningPrompt` 之后）：

```typescript
function initAgentPool(provider: string, modelId: string): void {
  const model = createModel(provider, modelId)
  const streamFn = createStreamFn()
  const tools = getBuiltinTools()
  agentPool = new AgentPool(
    streamFn, tools, model,
    (p) => {
      const providersJson = getSettingValue<string>('ai_providers', '{}')
      const providers = JSON.parse(providersJson) as Record<string, string>
      return providers[p] || ''
    },
    ''
  )
}
```

- [ ] **Step 2: 在 startILinkBot 中初始化**

在 `const config = getILinkConfig()` 之后、创建 bot 之前：

```typescript
initAgentPool(config.provider, config.model)
```

- [ ] **Step 3: 替换消息处理中的 AI 调用**

将 `try { ... streamChatWithPi(...) ... }` 块替换为：

```typescript
try {
  const pool = agentPool!
  const userMode = userModes.get(msg.userId)
  const effectivePrompt = userMode?.mode === 'learning'
    ? getLearningPrompt(userMode.learningTopic)
    : config.system_prompt

  const agent = pool.getOrCreate(msg.userId, () => {
    const dbHistory = getMessageHistory(msg.userId)
    return convertMessages(dbHistory as ChatMessage[])
  })

  const timestamp = formatBeijingTime()
  const systemMsg: ChatMessage = { role: 'system', content: effectivePrompt }
  const userMsg: ChatMessage = {
    role: 'user', content: `${timestamp} ${msg.text}`
  }

  let replyContent = ''
  const unsub = agent.subscribe((event, _signal) => {
    if (event.type === 'agent_end') {
      const lastMsg = event.messages[event.messages.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        replyContent = lastMsg.content
          .filter((c): c is { type: 'text'; text: string } =>
            c.type === 'text')
          .map(c => c.text).join('')
      }
    }
  })

  await agent.prompt(convertMessages([systemMsg, userMsg]))
  await agent.waitForIdle()
  unsub()

  await bot!.reply(msg, replyContent || '抱歉，没有生成回复。')
  addMessageToHistory(msg.userId, 'assistant', replyContent)
  messagesProcessed++
  lastMessageAt = new Date().toISOString()
  lastError = null
  console.log(`[ilink] 已回复 ${msg.userId}: ${replyContent.slice(0, 50)}...`)
} catch (error) {
  const errMsg = (error as Error).message || 'Unknown error'
  console.error(`[ilink] 处理消息失败:`, errMsg)
  lastError = errMsg
  try {
    await bot!.reply(msg, '抱歉，处理您的消息时出现了错误，请稍后再试。')
  } catch (replyErr) {
    console.error('[ilink] 发送错误回复失败:', replyErr)
  }
}
```

同时删除原来放在 try 块外面的 `addMessageToHistory(msg.userId, 'user', ...)` 调用——用户消息现在由 Agent 自动管理。

- [ ] **Step 4: 更新 /清空上下文 指令**

```typescript
if (msg.text?.trim() === '/清空上下文') {
  clearMessageHistory(msg.userId)
  userModes.delete(msg.userId)
  agentPool?.remove(msg.userId)
  await bot!.reply(msg, '已清空当前对话上下文。')
  return
}
```

- [ ] **Step 5: stopILinkBot 中关闭 AgentPool**

```typescript
agentPool?.shutdown()
agentPool = null
```

- [ ] **Step 6: 类型检查**

```bash
cd server && npx tsc --noEmit
```

- [ ] **Step 7: 提交**

```bash
git add server/src/services/wechat/ilink-bot.service.ts
git commit -m "refactor: ilink-bot 接入 AgentPool，替换 streamChatWithPi"
```

---

### Task 6: chat.service.ts 接入 AgentPool

**Files:**
- Modify: `server/src/services/chat.service.ts`

- [ ] **Step 1: 新增导入和 AgentPool 管理**

```typescript
import { AgentPool } from './ai/agent-pool.js'
import {
  createStreamFn, createModel, convertMessages, type ChatMessage
} from './ai/pi-ai.adapter.js'
import { getBuiltinTools } from './ai/builtin-tools.js'

const chatPools = new Map<string, AgentPool>()

function getChatPool(provider: string, modelId: string): AgentPool {
  const key = `${provider}:${modelId}`
  let pool = chatPools.get(key)
  if (!pool) {
    const model = createModel(provider, modelId)
    const tools = getBuiltinTools()
    pool = new AgentPool(
      createStreamFn(), tools, model,
      (p) => {
        const providersJson = getSettingValue<string>('ai_providers', '{}')
        const providers = JSON.parse(providersJson) as Record<string, string>
        return providers[p] || ''
      }, ''
    )
    chatPools.set(key, pool)
  }
  return pool
}
```

- [ ] **Step 2: 重写 streamChat 函数**

保持 `res.setHeader` SSE 设置不变，替换 try 块内部逻辑：

```typescript
try {
  const dbMessages = db.prepare(
    'SELECT role, content FROM messages WHERE conversation_id = ? AND is_error = 0 ORDER BY created_at ASC'
  ).all(conversationId) as { role: string; content: string }[]

  const pool = getChatPool(conversation.provider, conversation.model)
  const convKey = `conv:${conversationId}`

  const systemPrompt = (conversation.kb_enabled || conversation.tools_enabled)
    ? getSettingValue<string>('note_tools_prompt', DEFAULT_NOTE_TOOLS_PROMPT)
    : DEFAULT_CHAT_SYSTEM_PROMPT

  const systemMsg: ChatMessage = { role: 'system', content: systemPrompt }
  const userMsg: ChatMessage = { role: 'user', content: userContent }

  let assistantContent = ''
  const agent = pool.getOrCreate(convKey, () =>
    convertMessages(dbMessages as ChatMessage[])
  )

  writeSSE('start', { messageId: 0, conversationId, userMessageId })

  const unsub = agent.subscribe((event, _signal) => {
    if (event.type === 'message_update') {
      const ev = event.assistantMessageEvent
      // assistantMessageEvent 内容结构：提取文本增量
      if ('content' in ev && typeof ev.content === 'string') {
        const delta = ev.content as string
        assistantContent += delta
        writeSSE('delta', { content: delta })
      }
    } else if (event.type === 'agent_end') {
      const lastMsg = event.messages[event.messages.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        assistantContent = lastMsg.content
          .filter((c): c is { type: 'text'; text: string } =>
            c.type === 'text')
          .map(c => c.text).join('')
      }
    }
  })

  await agent.prompt(convertMessages([systemMsg, userMsg]))
  await agent.waitForIdle()
  unsub()

  // 持久化 assistant 消息
  const assistantMsgResult = db.prepare(
    'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
  ).run(conversationId, 'assistant', assistantContent)
  const assistantMessageId = assistantMsgResult.lastInsertRowid as number

  // 首条消息时自动设标题
  const msgCount = (db.prepare(
    'SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?'
  ).get(conversationId) as { c: number }).c
  if (conversation.title === '新对话' && msgCount <= 2) {
    const title = userContent.slice(0, 30)
    db.prepare(
      "UPDATE conversations SET title = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
    ).run(title, conversationId)
  } else {
    db.prepare(
      "UPDATE conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
    ).run(conversationId)
  }

  writeSSE('done', {
    messageId: assistantMessageId, tokensUsed: null,
    content: assistantContent, kbCitations: [], toolCalls: [],
    stopReason: 'stop',
  })
} catch (error) {
  const err = error as Error
  console.error('[chat] streamChat error:', err.message)
  writeSSE('error', { code: 'AI_ERROR', message: err.message })
}

res.end()
```

- [ ] **Step 3: 类型检查**

```bash
cd server && npx tsc --noEmit
```

- [ ] **Step 4: 提交**

```bash
git add server/src/services/chat.service.ts
git commit -m "refactor: chat.service 接入 AgentPool，替换 streamChatWithPi"
```

---

### Task 7: 清理旧代码 + 最终验证

**Files:**
- Modify: `server/src/index.ts` (删除 `registerBuiltinTools` 调用)
- Check: 全局 grep

- [ ] **Step 1: 删除 index.ts 中残留注释**

```typescript
// 删除注释掉的行
// import { registerBuiltinTools } from './services/ai/builtin-tools.js'
// registerBuiltinTools()
```

- [ ] **Step 2: 全局搜索确认无残留**

```bash
grep -r "streamChatWithPi" server/src/ --include="*.ts"
grep -r "registerBuiltinTools" server/src/ --include="*.ts"
grep -r "registerTool\|executeToolCall\|getToolDefinitions" server/src/ --include="*.ts"
```

预期全部零匹配。

- [ ] **Step 3: 全量类型检查 + 测试**

```bash
cd server && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 4: 提交**

```bash
git add server/src/index.ts
git commit -m "chore: 清理旧 agent loop 残留代码"
```
