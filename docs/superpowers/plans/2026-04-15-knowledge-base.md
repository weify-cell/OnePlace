# 知识库功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AI 对话添加知识库功能，支持基于笔记内容的 RAG 检索，对话级别开关，可配置 embedding provider

**Architecture:** 采用 Qdrant 向量数据库 + 可配置 embedding 服务商的 RAG 架构。笔记保存时异步生成向量存入 Qdrant；对话时检索相关片段注入 AI context

**Tech Stack:** Qdrant (Docker), REST API (Express), SSE streaming, Vue 3 + Pinia

---

## 文件结构

```
server/src/
  services/ai/embedding-client.ts      # [新建] embedding 服务调用
  services/vector/vector.service.ts    # [新建] Qdrant CRUD
  services/vector/embedding-queue.ts  # [新建] 异步 embedding 队列
  services/knowledge-base.service.ts   # [新建] 知识库业务逻辑
  controllers/knowledge-base.controller.ts  # [新建] KB API 控制器
  routes/knowledge-base.routes.ts      # [新建] KB API 路由
  database/migrations/007_kb_conversations.sql  # [新建] conversations 表扩展
  services/chat.service.ts             # [修改] streamChat 注入知识库
  services/notes.service.ts            # [修改] 笔记保存触发 embedding 队列

src/
  api/knowledge-base.api.ts           # [新建] KB 配置 API
  stores/chat.store.ts                # [修改] 支持 references 字段
  views/ChatView.vue                  # [修改] 知识库设置入口
  components/chat/KnowledgeBasePanel.vue  # [新建] KB 设置面板
  components/chat/MessageBubble.vue  # [修改] 引用来源展示
  views/SettingsView.vue              # [修改] 知识库配置区块
  types/index.ts                      # [修改] Message 扩展 references
```

---

## Task 1: 数据库迁移

**Files:**
- Create: `server/src/database/migrations/007_kb_conversations.sql`

- [ ] **Step 1: Write migration**

```sql
-- v1.11 knowledge-base
-- conversations 表新增知识库开关和检索范围
ALTER TABLE conversations ADD COLUMN kb_enabled INTEGER DEFAULT 0;
ALTER TABLE conversations ADD COLUMN kb_scope TEXT DEFAULT 'all';
```

- [ ] **Step 2: Run migration to verify**

Run: `cd server && npm run dev` (migration runs on server start)
Expected: No error on startup, `_migrations` table has new entry

- [ ] **Step 3: Commit**

```bash
git add server/src/database/migrations/007_kb_conversations.sql
git commit -m "db: add kb_enabled and kb_scope to conversations table"
```

---

## Task 2: Embedding 服务调用

**Files:**
- Create: `server/src/services/ai/embedding-client.ts`
- Modify: `server/src/services/ai/providers.ts` (add embedding models)

- [ ] **Step 1: Add embedding models to providers.ts**

```typescript
// 在 AI_PROVIDERS 导出中每个 provider 添加 embedding model 字段
// 例如 qwen: { ..., embedding_model: 'text-embedding-v2' }
// 这样 embedding-client.ts 可以通过 provider name 获取对应的 embedding model
```

- [ ] **Step 2: Write embedding-client.ts**

```typescript
// server/src/services/ai/embedding-client.ts
import OpenAI from 'openai'
import { AI_PROVIDERS } from './providers.js'
import { getSettingValue } from '../settings.service.js'

export interface EmbeddingResult {
  embedding: number[]
  model: string
  usage: { total_tokens: number }
}

const EMBEDDING_DIMENSIONS: Record<string, number> = {
  'qwen-embedding-v2': 1024,
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
}

export function getEmbeddingDimension(provider: string, model: string): number {
  return EMBEDDING_DIMENSIONS[model] || 1024
}

export function createEmbeddingClient(provider: string) {
  const providerConfig = AI_PROVIDERS[provider]
  if (!providerConfig) throw new Error(`Unknown embedding provider: ${provider}`)

  const aiProviders = getSettingValue<Record<string, { apiKey?: string; baseURL?: string }>>('ai_providers', {})
  const providerSettings = aiProviders[provider] || {}
  const apiKey = providerSettings.apiKey || 'sk-placeholder'
  const baseURL = provider === 'custom' ? (providerSettings.baseURL || '') : providerConfig.baseURL

  const client = new OpenAI({ apiKey, baseURL })
  return { client, apiKey }
}

export async function embedText(text: string, provider: string, model: string): Promise<number[]> {
  const { client } = createEmbeddingClient(provider)
  const response = await client.embeddings.create({
    model,
    input: text
  })
  return response.data[0].embedding
}

export async function embedTexts(texts: string[], provider: string, model: string): Promise<number[][]> {
  if (texts.length === 0) return []
  const { client } = createEmbeddingClient(provider)
  const response = await client.embeddings.create({
    model,
    input: texts
  })
  return response.data.map(d => d.embedding)
}
```

- [ ] **Step 3: Verify module loads without error**

Run: `cd server && npx tsx -e "import './src/services/ai/embedding-client.ts'"`
Expected: No error (type check only, no runtime execution)

- [ ] **Step 4: Commit**

```bash
git add server/src/services/ai/embedding-client.ts server/src/services/ai/providers.ts
git commit -m "feat(embedding): add configurable embedding client service"
```

---

## Task 3: Qdrant 向量服务

**Files:**
- Create: `server/src/services/vector/vector.service.ts`

- [ ] **Step 1: Write vector.service.ts**

```typescript
// server/src/services/vector/vector.service.ts
import { getSettingValue } from '../settings.service.js'

export interface ChunkPayload {
  chunk_id: string
  note_id: number
  title: string
  content: string
  tags: string[]
  folder_id: number | null
  created_at: string
}

export interface SearchResult {
  chunk_id: string
  note_id: number
  title: string
  content: string
  tags: string[]
  score: number
}

function getQdrantConfig() {
  return {
    url: getSettingValue<string>('qdrant_url', 'http://localhost:6333'),
    collection: getSettingValue<string>('qdrant_collection', 'notes_knowledge_base'),
  }
}

async function qdrantRequest(path: string, method = 'GET', body?: unknown) {
  const { url } = getQdrantConfig()
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Qdrant ${method} ${path} failed: ${res.status} ${text}`)
  }
  return res.json()
}

export async function upsertChunks(chunks: { id: string; vector: number[]; payload: ChunkPayload }[]): Promise<void> {
  if (chunks.length === 0) return
  const { collection } = getQdrantConfig()
  await qdrantRequest(`/collections/${collection}/points`, 'PUT', {
    points: chunks.map(c => ({
      id: c.id,
      vector: c.vector,
      payload: c.payload,
    }))
  })
}

export async function searchChunks(queryVector: number[], topK: number): Promise<SearchResult[]> {
  const { collection } = getQdrantConfig()
  const result = await qdrantRequest(`/collections/${collection}/points/search`, 'POST', {
    vector: queryVector,
    limit: topK,
    with_payload: true,
  })
  return (result.result || []).map((r: any) => ({
    chunk_id: r.payload.chunk_id,
    note_id: r.payload.note_id,
    title: r.payload.title,
    content: r.payload.content,
    tags: r.payload.tags || [],
    score: r.score,
  }))
}

export async function deleteChunksByNoteId(noteId: number): Promise<void> {
  const { collection } = getQdrantConfig()
  await qdrantRequest(`/collections/${collection}/points/delete`, 'POST', {
    filter: {
      must: [{ key: 'note_id', match: { value: noteId } }]
    }
  })
}

export async function createCollectionIfNotExists(dimension: number): Promise<void> {
  const { collection } = getQdrantConfig()
  try {
    await qdrantRequest(`/collections/${collection}`)
  } catch {
    await qdrantRequest('/collections', 'POST', {
      collection_name: collection,
      vectors_config: { size: dimension, distance: 'Cosine' }
    })
  }
}

export async function deleteCollection(): Promise<void> {
  const { collection } = getQdrantConfig()
  try {
    await qdrantRequest(`/collections/${collection}`, 'DELETE')
  } catch {
    // collection may not exist
  }
}

export async function getCollectionInfo(): Promise<{ points_count: number }> {
  const { collection } = getQdrantConfig()
  try {
    const info = await qdrantRequest(`/collections/${collection}`)
    return { points_count: info.result?.points_count || 0 }
  } catch {
    return { points_count: 0 }
  }
}
```

- [ ] **Step 2: Verify module loads without error**

Run: `cd server && npx tsx -e "import './src/services/vector/vector.service.ts'"`
Expected: No error

- [ ] **Step 3: Commit**

```bash
git add server/src/services/vector/vector.service.ts
git commit -m "feat(vector): add Qdrant vector service for knowledge base"
```

---

## Task 4: 异步 Embedding 队列

**Files:**
- Create: `server/src/services/vector/embedding-queue.ts`
- Modify: `server/src/services/notes.service.ts` (触发队列)

- [ ] **Step 1: Write embedding-queue.ts**

```typescript
// server/src/services/vector/embedding-queue.ts
import { embedTexts } from '../ai/embedding-client.js'
import { upsertChunks, deleteChunksByNoteId, createCollectionIfNotExists } from './vector.service.js'
import { getNoteById } from '../notes.service.js'
import { getSettingValue } from '../settings.service.js'
import { getEmbeddingDimension } from '../ai/embedding-client.js'

interface EmbeddingTask {
  noteId: number
  action: 'upsert' | 'delete'
  timestamp: number
}

const taskQueue: EmbeddingTask[] = []
let isProcessing = false

function splitIntoChunks(text: string, chunkSize = 500, overlap = 50): string[] {
  const paragraphs = text.split(/\n\n+/)
  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    if (para.trim().length < 10) continue
    if (current.length + para.length + 2 <= chunkSize) {
      current += (current ? '\n\n' : '') + para
    } else {
      if (current) chunks.push(current)
      // overlap: keep last part
      const overlapText = current.slice(-overlap)
      current = overlapText + (overlapText ? '\n\n' : '') + para
    }
  }
  if (current.trim()) chunks.push(current)
  return chunks
}

async function processTask(task: EmbeddingTask): Promise<void> {
  const provider = getSettingValue<string>('embedding_provider', 'qwen')
  const model = getSettingValue<string>('embedding_model', 'qwen-embedding-v2')
  const dimension = getEmbeddingDimension(provider, model)

  if (task.action === 'delete') {
    await deleteChunksByNoteId(task.noteId)
    return
  }

  const note = getNoteById(task.noteId)
  if (!note || note.is_deleted) {
    await deleteChunksByNoteId(task.noteId)
    return
  }

  const plainText = note.content_text || note.content.replace(/<[^>]+>/g, '')
  const texts = splitIntoChunks(plainText)
  if (texts.length === 0) {
    await deleteChunksByNoteId(task.noteId)
    return
  }

  await createCollectionIfNotExists(dimension)

  // Retry logic: 3 attempts with exponential backoff
  let vectors: number[][]
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      vectors = await embedTexts(texts, provider, model)
      break
    } catch (e) {
      if (attempt === 2) {
        console.error(`[embedding-queue] Failed to embed note ${task.noteId} after 3 attempts:`, e)
        return
      }
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
    }
  }

  const chunks = texts.map((content, index) => ({
    id: `note_${note.id}_${index}`,
    vector: vectors[index],
    payload: {
      chunk_id: `note_${note.id}_${index}`,
      note_id: note.id,
      title: note.title,
      content,
      tags: note.tags,
      folder_id: note.folder_id,
      created_at: note.created_at,
    }
  }))

  await upsertChunks(chunks)
}

async function processQueue(): Promise<void> {
  isProcessing = true
  while (taskQueue.length > 0) {
    const task = taskQueue.shift()
    if (task) {
      try {
        await processTask(task)
      } catch (e) {
        console.error(`[embedding-queue] Task failed for note ${task.noteId}:`, e)
      }
    }
  }
  isProcessing = false
}

export function enqueueEmbeddingTask(task: EmbeddingTask): void {
  // Deduplicate: if same note already in queue, replace
  const existingIdx = taskQueue.findIndex(t => t.noteId === task.noteId)
  if (existingIdx >= 0) {
    taskQueue.splice(existingIdx, 1)
  }
  taskQueue.push(task)
  if (!isProcessing) {
    processQueue().catch(console.error)
  }
}
```

- [ ] **Step 2: Modify notes.service.ts to trigger queue**

在 `notes.service.ts` 的 `updateNote` 和 `deleteNote` 函数末尾添加：

```typescript
// 在 updateNote 末尾，SQL update 成功后
// 添加：
import { enqueueEmbeddingTask } from './vector/embedding-queue.js'
enqueueEmbeddingTask({ noteId: id, action: 'upsert', timestamp: Date.now() })

// 在 deleteNote 开头添加：
import { enqueueEmbeddingTask } from './vector/embedding-queue.js'
enqueueEmbeddingTask({ noteId: id, action: 'delete', timestamp: Date.now() })
```

注意：使用动态 import 避免循环依赖问题

- [ ] **Step 3: Verify no circular dependency**

Run: `cd server && npx tsx -e "import './src/services/notes.service.ts'"`
Expected: No error, no hang

- [ ] **Step 4: Commit**

```bash
git add server/src/services/vector/embedding-queue.ts server/src/services/notes.service.ts
git commit -m "feat(kb): add async embedding queue for note indexing"
```

---

## Task 5: 知识库业务逻辑

**Files:**
- Create: `server/src/services/knowledge-base.service.ts`
- Modify: `src/types/index.ts` — 统一 Reference 类型定义

**关键：Reference 类型需与前端 types/index.ts 的 MessageReference 保持一致（见 Task 9）**

- [ ] **Step 1: Write knowledge-base.service.ts**

```typescript
// server/src/services/knowledge-base.service.ts
import { embedText } from './ai/embedding-client.js'
import { searchChunks } from './vector/vector.service.js'
import { getSettingValue } from './settings.service.js'
import { getConversationById } from './chat.service.js'

// Note: MessageReference type is shared via JSON serialization between backend and frontend
// Backend serializes this as plain object in SSE response

export interface KnowledgeBaseContext {
  systemPrompt: string
  references: MessageReference[]
}

interface MessageReference {
  note_id: number
  title: string
  content: string
  score: number
}

export async function buildKnowledgeBaseContext(
  conversationId: number,
  userQuery: string
): Promise<KnowledgeBaseContext | null> {
  const conversation = getConversationById(conversationId)
  if (!conversation || !(conversation as any).kb_enabled) {
    return null
  }

  const enabled = getSettingValue<boolean>('kb_enabled', false)
  if (!enabled) return null

  const provider = getSettingValue<string>('embedding_provider', 'qwen')
  const model = getSettingValue<string>('embedding_model', 'qwen-embedding-v2')
  const topK = getSettingValue<number>('kb_top_k', 5)

  try {
    const [queryVector] = await Promise.all([embedText(userQuery, provider, model)])
    const chunks = await searchChunks(queryVector, topK)

    if (chunks.length === 0) {
      return { systemPrompt: '', references: [] }
    }

    // Deduplicate by note_id, keep highest score chunk per note
    const noteMap = new Map<number, KnowledgeBaseReference>()
    for (const chunk of chunks) {
      if (!noteMap.has(chunk.note_id)) {
        noteMap.set(chunk.note_id, {
          note_id: chunk.note_id,
          title: chunk.title,
          content: chunk.content,
          score: chunk.score,
        })
      }
    }
    const references = Array.from(noteMap.values())

    const systemPrompt = `你是一个助手。当用户提问时，如果提供了参考笔记片段，请结合这些内容回答。
如果参考内容中没有相关信息，请如实告知。

## 参考笔记
${references.map((r, i) => `[${i+1}] ${r.title}: ${r.content}`).join('\n\n')}

## 回答要求
- 基于上述参考内容回答，如果涉及多个笔记，请综合整理
- 如果参考内容无法回答问题，请说明"根据当前知识库无法回答该问题"`

## 注意
- 你的回答应该引用相关的笔记内容作为依据
- 如果有多篇笔记涉及同一问题，请综合各篇内容回答`

    return { systemPrompt, references }
  } catch (e) {
    console.error('[knowledge-base] Failed to build context:', e)
    return null
  }
}

export interface KnowledgeBaseConfig {
  kb_enabled: boolean
  embedding_provider: string
  embedding_api_key: string
  embedding_model: string
  qdrant_url: string
  qdrant_collection: string
  kb_top_k: number
  kb_chunk_size: number
  kb_chunk_overlap: number
  kb_default_enabled: boolean
}

export function getKnowledgeBaseConfig(): Partial<KnowledgeBaseConfig> {
  return {
    kb_enabled: getSettingValue<boolean>('kb_enabled', false),
    embedding_provider: getSettingValue<string>('embedding_provider', 'qwen'),
    qdrant_url: getSettingValue<string>('qdrant_url', 'http://localhost:6333'),
    qdrant_collection: getSettingValue<string>('qdrant_collection', 'notes_knowledge_base'),
    kb_top_k: getSettingValue<number>('kb_top_k', 5),
    kb_chunk_size: getSettingValue<number>('kb_chunk_size', 500),
    kb_chunk_overlap: getSettingValue<number>('kb_chunk_overlap', 50),
    kb_default_enabled: getSettingValue<boolean>('kb_default_enabled', false),
  }
}

export async function saveKnowledgeBaseConfig(config: Partial<KnowledgeBaseConfig>): Promise<void> {
  const { setSettingValue } = await import('./settings.service.js')
  if (config.kb_enabled !== undefined) await setSettingValue('kb_enabled', config.kb_enabled)
  if (config.embedding_provider !== undefined) await setSettingValue('embedding_provider', config.embedding_provider)
  if (config.qdrant_url !== undefined) await setSettingValue('qdrant_url', config.qdrant_url)
  if (config.qdrant_collection !== undefined) await setSettingValue('qdrant_collection', config.qdrant_collection)
  if (config.kb_top_k !== undefined) await setSettingValue('kb_top_k', config.kb_top_k)
  if (config.kb_chunk_size !== undefined) await setSettingValue('kb_chunk_size', config.kb_chunk_size)
  if (config.kb_chunk_overlap !== undefined) await setSettingValue('kb_chunk_overlap', config.kb_chunk_overlap)
  if (config.kb_default_enabled !== undefined) await setSettingValue('kb_default_enabled', config.kb_default_enabled)
  // Note: embedding_api_key stored separately in ai_providers
}
```

- [ ] **Step 2: Verify module loads**

Run: `cd server && npx tsx -e "import './src/services/knowledge-base.service.ts'"`
Expected: No error

- [ ] **Step 3: Commit**

```bash
git add server/src/services/knowledge-base.service.ts
git commit -m "feat(kb): add knowledge base service with context building"
```

---

## Task 6: 知识库 API 控制器和路由

**Files:**
- Create: `server/src/controllers/knowledge-base.controller.ts`
- Create: `server/src/routes/knowledge-base.routes.ts`
- Modify: `server/src/routes/index.ts` (注册路由)

- [ ] **Step 1: Write knowledge-base.controller.ts**

```typescript
// server/src/controllers/knowledge-base.controller.ts
import { Request, Response } from 'express'
import { getKnowledgeBaseConfig, saveKnowledgeBaseConfig } from '../services/knowledge-base.service.js'
import { getCollectionInfo, deleteCollection, createCollectionIfNotExists } from '../services/vector/vector.service.js'
import { getEmbeddingDimension } from '../services/ai/embedding-client.js'
import { getSettingValue } from '../services/settings.service.js'
import { getNotes } from '../services/notes.service.js'
import { enqueueEmbeddingTask } from '../services/vector/embedding-queue.js'

export async function getKnowledgeBaseSettings(req: Request, res: Response) {
  const config = getKnowledgeBaseConfig()
  // Don't return api key
  res.json({ data: { ...config, embedding_api_key: config.embedding_api_key ? '******' : '' } })
}

export async function updateKnowledgeBaseSettings(req: Request, res: Response) {
  const config = req.body
  await saveKnowledgeBaseConfig(config)
  res.json({ data: 'ok' })
}

export async function rebuildIndex(req: Request, res: Response) {
  // Run in background, return immediately
  res.json({ data: { message: 'Index rebuild started' } })

  const provider = getSettingValue<string>('embedding_provider', 'qwen')
  const model = getSettingValue<string>('embedding_model', 'qwen-embedding-v2')
  const dimension = getEmbeddingDimension(provider, model)

  // Rebuild: delete collection and re-create
  await deleteCollection()
  await createCollectionIfNotExists(dimension)

  // Enqueue all notes
  let page = 1
  const pageSize = 50
  while (true) {
    const { items } = getNotes({ page, pageSize, is_archived: false })
    if (items.length === 0) break
    for (const note of items) {
      enqueueEmbeddingTask({ noteId: note.id, action: 'upsert', timestamp: Date.now() })
    }
    page++
    if (items.length < pageSize) break
  }
}

export async function getKnowledgeBaseStats(req: Request, res: Response) {
  const info = await getCollectionInfo()
  res.json({ data: { points_count: info.points_count } })
}
```

- [ ] **Step 2: Write knowledge-base.routes.ts**

```typescript
// server/src/routes/knowledge-base.routes.ts
import { Router } from 'express'
import {
  getKnowledgeBaseSettings,
  updateKnowledgeBaseSettings,
  rebuildIndex,
  getKnowledgeBaseStats
} from '../controllers/knowledge-base.controller.js'

export const knowledgeBaseRouter = Router()

knowledgeBaseRouter.get('/settings', getKnowledgeBaseSettings)
knowledgeBaseRouter.put('/settings', updateKnowledgeBaseSettings)
knowledgeBaseRouter.post('/rebuild', rebuildIndex)
knowledgeBaseRouter.get('/stats', getKnowledgeBaseStats)
```

- [ ] **Step 3: Register route in server/src/index.ts**

在 `index.ts` 中添加：

```typescript
import { knowledgeBaseRouter } from './routes/knowledge-base.routes.js'
// ...
app.use('/api/knowledge-base', knowledgeBaseRouter)
```

- [ ] **Step 4: Verify route registration**

Run: `cd server && npx tsx -e "import './src/index.ts'"` 并检查输出
Expected: Server starts without error

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/knowledge-base.controller.ts server/src/routes/knowledge-base.routes.ts server/src/index.ts
git commit -m "feat(kb): add knowledge base API routes and controller"
```

---

## Task 7: 扩展 Chat 服务支持知识库注入

**Files:**
- Modify: `server/src/services/chat.service.ts`

- [ ] **Step 1: Modify streamChat to inject knowledge base context**

在 `streamChat` 函数中，在构建 messages 数组之后、调用 `client.chat.completions.create` 之前添加：

```typescript
// 在 userContent 定义后、stream 创建前插入：
// 知识库上下文注入
const kbContext = await buildKnowledgeBaseContext(conversationId, userContent)
let systemPrompt = ''
if (kbContext?.systemPrompt) {
  systemPrompt = kbContext.systemPrompt
}

const messages = (db.prepare('SELECT role, content FROM messages WHERE conversation_id = ? AND is_error = 0 ORDER BY created_at ASC').all(conversationId) as { role: string; content: string }[])
  .filter(m => m.content.trim().length > 0)

if (systemPrompt) {
  messages.unshift({ role: 'system', content: systemPrompt })
}
```

然后在 SSE `done` 事件中传递 references：

```typescript
// writeSSE('done', { messageId: assistantMessageId, tokensUsed, content: fullContent })
// 改为：
writeSSE('done', {
  messageId: assistantMessageId,
  tokensUsed,
  content: fullContent,
  references: kbContext?.references || []
})
```

- [ ] **Step 2: Import buildKnowledgeBaseContext**

在 `chat.service.ts` 顶部添加：

```typescript
import { buildKnowledgeBaseContext } from './knowledge-base.service.js'
```

- [ ] **Step 3: Verify build**

Run: `cd server && npm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/src/services/chat.service.ts
git commit -m "feat(kb): inject knowledge base context into chat streaming"
```

---

## Task 8: 前端 API 层

**Files:**
- Create: `src/api/knowledge-base.api.ts`

- [ ] **Step 1: Write knowledge-base.api.ts**

```typescript
// src/api/knowledge-base.api.ts
import type { AxiosPromise } from 'axios'
import { api } from './index'

export interface KnowledgeBaseSettings {
  kb_enabled: boolean
  embedding_provider: string
  embedding_api_key: string
  embedding_model: string
  qdrant_url: string
  qdrant_collection: string
  kb_top_k: number
  kb_chunk_size: number
  kb_chunk_overlap: number
  kb_default_enabled: boolean
}

export interface KnowledgeBaseStats {
  points_count: number
}

export const knowledgeBaseApi = {
  getSettings(): AxiosPromise<{ data: KnowledgeBaseSettings }> {
    return api.get('/knowledge-base/settings')
  },

  updateSettings(settings: Partial<KnowledgeBaseSettings>): AxiosPromise<{ data: string }> {
    return api.put('/knowledge-base/settings', settings)
  },

  rebuild(): AxiosPromise<{ data: { message: string } }> {
    return api.post('/knowledge-base/rebuild')
  },

  getStats(): AxiosPromise<{ data: KnowledgeBaseStats }> {
    return api.get('/knowledge-base/stats')
  },
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx vue-tsc --noEmit 2>&1 | head -20`
Expected: No errors related to this file

- [ ] **Step 3: Commit**

```bash
git add src/api/knowledge-base.api.ts
git commit -m "feat(kb): add knowledge base frontend API client"
```

---

## Task 9: 前端类型扩展

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add references to Message type**

在 `Message` 接口中添加：

```typescript
export interface MessageReference {
  note_id: number
  title: string
  content: string
  score: number
}

export interface Message {
  id: number
  conversation_id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  tokens_used: number | null
  is_error: boolean
  created_at: string
  references?: MessageReference[]  // 新增
}

export interface Conversation {
  id: number
  title: string
  model: string
  provider: string
  is_deleted: boolean
  created_at: string
  updated_at: string
  kb_enabled?: boolean   // 新增
  kb_scope?: string      // 新增
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(kb): add Message.references and Conversation.kb_enabled to types"
```

---

## Task 10: 知识库设置面板组件

**Files:**
- Create: `src/components/chat/KnowledgeBasePanel.vue`

- [ ] **Step 1: Write KnowledgeBasePanel.vue**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { knowledgeBaseApi, type KnowledgeBaseSettings } from '@/api/knowledge-base.api'
import { useMessage } from 'naive-ui'

const props = defineProps<{
  conversationId: number
  kbEnabled: boolean
}>()

const emit = defineEmits<{
  'update:kbEnabled': [value: boolean]
}>()

const message = useMessage()
const settings = ref<Partial<KnowledgeBaseSettings>>({})
const loading = ref(false)
const statsLoading = ref(false)
const stats = ref({ points_count: 0 })
const panelVisible = ref(false)

const localKbEnabled = computed({
  get: () => props.kbEnabled,
  set: (v) => emit('update:kbEnabled', v)
})

async function loadSettings() {
  loading.value = true
  try {
    const res = await knowledgeBaseApi.getSettings()
    settings.value = res.data.data
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  statsLoading.value = true
  try {
    const res = await knowledgeBaseApi.getStats()
    stats.value = res.data.data
  } finally {
    statsLoading.value = false
  }
}

async function saveSettings() {
  try {
    await knowledgeBaseApi.updateSettings(settings.value)
    message.success('知识库设置已保存')
  } catch (e) {
    message.error('保存失败')
  }
}

async function rebuildIndex() {
  try {
    await knowledgeBaseApi.rebuild()
    message.success('索引重建已启动')
  } catch (e) {
    message.error('重建失败')
  }
}

function toggle() {
  panelVisible.value = !panelVisible.value
  if (panelVisible.value) {
    loadSettings()
    loadStats()
  }
}

defineExpose({ toggle })
</script>

<template>
  <div class="kb-panel">
    <div class="kb-panel__header">
      <span class="kb-panel__title">📚 知识库设置</span>
    </div>

    <div class="kb-panel__body">
      <!-- 启用开关 -->
      <div class="kb-panel__row">
        <span>启用知识库</span>
        <n-switch v-model:value="localKbEnabled" />
      </div>

      <!-- 检索范围 -->
      <div class="kb-panel__row">
        <span>检索范围</span>
        <n-radio-group value="all" size="small">
          <n-radio value="all">全部笔记</n-radio>
        </n-radio-group>
      </div>

      <!-- Top K -->
      <div class="kb-panel__row">
        <span>Top K: {{ settings.kb_top_k || 5 }}</span>
        <n-slider
          v-model:value="settings.kb_top_k!"
          :min="1"
          :max="20"
          :step="1"
          style="width: 120px"
        />
      </div>

      <!-- 重建索引按钮 -->
      <div class="kb-panel__actions">
        <n-button size="small" :loading="statsLoading" @click="loadStats">
          刷新统计
        </n-button>
        <n-button size="small" type="warning" @click="rebuildIndex">
          重建索引
        </n-button>
        <n-button size="small" type="primary" @click="saveSettings">
          保存
        </n-button>
      </div>

      <!-- 统计信息 -->
      <div class="kb-panel__stats">
        已索引：{{ stats.points_count }} 个段落
      </div>
    </div>
  </div>
</template>

<style scoped>
.kb-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 12px 16px;
  min-width: 280px;
}

.kb-panel__header {
  margin-bottom: 12px;
}

.kb-panel__title {
  font-weight: 600;
  font-size: 0.875rem;
}

.kb-panel__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.kb-panel__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.8125rem;
  gap: 12px;
}

.kb-panel__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.kb-panel__stats {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-align: right;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/KnowledgeBasePanel.vue
git commit -m "feat(kb): add KnowledgeBasePanel component"
```

---

## Task 11: ChatView 集成知识库入口

**Files:**
- Modify: `src/views/ChatView.vue`

- [ ] **Step 1: Add KB button and panel to ChatView.vue header**

在 `<div class="chat-header__meta">` 中，provider 后面添加：

```vue
<!-- 知识库设置入口 -->
<n-tooltip trigger="hover">
  <template #trigger>
    <div
      class="chat-header__kb-btn"
      :class="{ 'chat-header__kb-btn--active': kbPanelVisible }"
      @click="toggleKbPanel"
    >
      <span>📚</span>
    </div>
  </template>
  {{ chatStore.currentConversation?.kb_enabled ? '知识库：已启用' : '知识库：已关闭' }}
</n-tooltip>
```

在 chat-header 中添加 KB panel：

```vue
<!-- 知识库设置面板 -->
<div v-if="kbPanelVisible && chatStore.currentConversation" class="chat-header__kb-panel">
  <KnowledgeBasePanel
    :conversation-id="chatStore.currentConversation.id"
    :kb-enabled="!!chatStore.currentConversation.kb_enabled"
    @update:kb-enabled="onKbEnabledChange"
  />
</div>
```

添加 `<script setup>` 中的逻辑：

```typescript
import KnowledgeBasePanel from '@/components/chat/KnowledgeBasePanel.vue'

const kbPanelVisible = ref(false)

function toggleKbPanel() {
  kbPanelVisible.value = !kbPanelVisible.value
}

async function onKbEnabledChange(enabled: boolean) {
  if (!chatStore.currentConversation) return
  await chatApi.updateConversation(chatStore.currentConversation.id, {
    kb_enabled: enabled
  })
  // Refresh conversation
  await chatStore.fetchConversations()
  const conv = chatStore.conversations.find(c => c.id === chatStore.currentConversation?.id)
  if (conv) chatStore.currentConversation = conv
}
```

添加样式：

```css
.chat-header__kb-btn {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-md);
  font-size: 1rem;
  transition: background 0.2s;
}

.chat-header__kb-btn:hover {
  background: rgba(245, 158, 11, 0.1);
}

.chat-header__kb-btn--active {
  background: rgba(245, 158, 11, 0.15);
}

.chat-header__kb-panel {
  position: absolute;
  top: 100%;
  right: 24px;
  z-index: 100;
  margin-top: 8px;
  box-shadow: var(--shadow-lg);
  border-radius: var(--radius-lg);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | head -30`
Expected: No Vue template errors

- [ ] **Step 3: Commit**

```bash
git add src/views/ChatView.vue
git commit -m "feat(kb): integrate knowledge base panel in ChatView"
```

---

## Task 12: MessageBubble 引用展示

**Files:**
- Modify: `src/components/chat/MessageBubble.vue`

- [ ] **Step 1: Read current MessageBubble.vue**

```bash
cat src/components/chat/MessageBubble.vue
```

- [ ] **Step 2: Add references rendering**

在 assistant 类型的消息气泡底部，content 后面添加：

```vue
<!-- 引用来源 -->
<div v-if="message.role === 'assistant' && message.references?.length" class="message-bubble__references">
  <div class="references__header" @click="refsExpanded = !refsExpanded">
    <span>📚 参考了 {{ message.references!.length }} 篇笔记</span>
    <span class="references__toggle">{{ refsExpanded ? '▲' : '▼' }}</span>
  </div>
  <div v-if="refsExpanded" class="references__list">
    <div
      v-for="(ref, index) in message.references"
      :key="ref.note_id"
      class="references__item"
    >
      <div class="references__item-title">[{{ index + 1 }}] {{ ref.title }}</div>
      <div class="references__item-content">{{ ref.content }}</div>
    </div>
  </div>
</div>
```

添加 `<script setup>` 中的状态和类型扩展：

```typescript
const refsExpanded = ref(false)

// Watch for new message with references to auto-expand
watch(() => props.message.references, (newRefs) => {
  if (newRefs?.length) refsExpanded.value = false
})
```

添加样式：

```css
.message-bubble__references {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
  font-size: 0.75rem;
}

.references__header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: var(--text-muted);
  font-weight: 500;
}

.references__toggle {
  font-size: 0.625rem;
}

.references__list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.references__item {
  background: var(--bg-content);
  border-radius: var(--radius-md);
  padding: 6px 10px;
}

.references__item-title {
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.references__item-content {
  color: var(--text-secondary);
  line-height: 1.4;
}
```

- [ ] **Step 3: Verify no errors**

Run: `npm run build 2>&1 | grep -i "MessageBubble" | head -10`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/MessageBubble.vue
git commit -m "feat(kb): add reference display in MessageBubble"
```

---

## Task 13: SettingsView 知识库配置区块

**Files:**
- Modify: `src/views/SettingsView.vue`

- [ ] **Step 1: Read SettingsView.vue**

```bash
cat src/views/SettingsView.vue
```

- [ ] **Step 2: Add knowledge base section**

在现有设置区块后面添加新的区块：

```vue
<!-- 知识库配置 -->
<n-divider>知识库</n-divider>

<div class="settings-section">
  <div class="settings-section__title">📚 知识库配置</div>

  <div class="settings-section__row">
    <span>启用知识库功能</span>
    <n-switch v-model:value="kbSettings.kb_enabled" />
  </div>

  <div class="settings-section__row">
    <span>Embedding 服务商</span>
    <n-select
      v-model:value="kbSettings.embedding_provider"
      :options="embeddingProviderOptions"
      style="width: 180px"
    />
  </div>

  <div class="settings-section__row">
    <span>Embedding 模型</span>
    <n-input
      v-model:value="kbSettings.embedding_model"
      placeholder="如 qwen-embedding-v2"
      style="width: 240px"
    />
  </div>

  <div class="settings-section__row">
    <span>Qdrant 地址</span>
    <n-input
      v-model:value="kbSettings.qdrant_url"
      placeholder="http://localhost:6333"
      style="width: 240px"
    />
  </div>

  <div class="settings-section__row">
    <span>Collection 名称</span>
    <n-input
      v-model:value="kbSettings.qdrant_collection"
      placeholder="notes_knowledge_base"
      style="width: 240px"
    />
  </div>

  <div class="settings-section__row">
    <span>分块大小</span>
    <n-input-number v-model:value="kbSettings.kb_chunk_size" :min="100" :max="2000" style="width: 120px" />
    <span class="settings-section__hint">字</span>
  </div>

  <div class="settings-section__row">
    <span>重叠字数</span>
    <n-input-number v-model:value="kbSettings.kb_chunk_overlap" :min="0" :max="500" style="width: 120px" />
    <span class="settings-section__hint">字</span>
  </div>

  <div class="settings-section__row">
    <span>新对话默认启用</span>
    <n-switch v-model:value="kbSettings.kb_default_enabled" />
  </div>

  <div class="settings-section__actions">
    <n-button type="primary" :loading="savingKb" @click="saveKbSettings">
      保存知识库配置
    </n-button>
  </div>
</div>
```

添加 `<script setup>` 中的数据和方法：

```typescript
import { knowledgeBaseApi } from '@/api/knowledge-base.api'

const kbSettings = ref({
  kb_enabled: false,
  embedding_provider: 'qwen',
  embedding_model: 'qwen-embedding-v2',
  qdrant_url: 'http://localhost:6333',
  qdrant_collection: 'notes_knowledge_base',
  kb_chunk_size: 500,
  kb_chunk_overlap: 50,
  kb_default_enabled: false,
})

const embeddingProviderOptions = [
  { label: '通义千问', value: 'qwen' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'Moonshot', value: 'kimi' },
  { label: '智谱', value: 'zhipu' },
]

const savingKb = ref(false)

async function loadKbSettings() {
  const res = await knowledgeBaseApi.getSettings()
  Object.assign(kbSettings.value, res.data.data)
}

async function saveKbSettings() {
  savingKb.value = true
  try {
    await knowledgeBaseApi.updateSettings(kbSettings.value)
    window.$message.success('知识库配置已保存')
  } finally {
    savingKb.value = false
  }
}

onMounted(() => {
  loadKbSettings()
})
```

添加样式：

```css
.settings-section__hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-left: 4px;
}

.settings-section__actions {
  margin-top: 12px;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/views/SettingsView.vue
git commit -m "feat(kb): add knowledge base settings section in SettingsView"
```

---

## Task 14: 前端 API 层 - 更新 Conversation

**Files:**
- Modify: `src/api/chat.api.ts`

- [ ] **Step 1: Add updateConversation**

在 `chat.api.ts` 中添加 `updateConversation` 方法（如果不存在）：

```typescript
updateConversation(id: number, data: { title?: string; model?: string; provider?: string; kb_enabled?: boolean }): AxiosPromise<any> {
  return api.put(`/conversations/${id}`, data)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/api/chat.api.ts
git commit -m "feat(kb): add kb_enabled to updateConversation API"
```

---

## Task 15: 前端 chat.store 解析 references

**Files:**
- Modify: `src/stores/chat.store.ts`

- [ ] **Step 1: Update SSE done event parsing**

在 `sendMessage` 函数中，当解析 `event === 'done'` 时：

```typescript
if (event === 'done') {
  const assistantMessage: Message = {
    id: parsed.messageId,
    conversation_id: currentConversation.value!.id,
    role: 'assistant',
    content: parsed.content || streamingMessage.value,
    tokens_used: parsed.tokensUsed,
    is_error: false,
    created_at: new Date().toISOString(),
    references: parsed.references || []  // 新增
  }
  messages.value.push(assistantMessage)
  streamingMessage.value = ''
  await fetchConversations()
}
```

- [ ] **Step 2: Commit**

```bash
git add src/stores/chat.store.ts
git commit -m "feat(kb): parse references from SSE done event in chat store"
```

---

## 实施后验证

1. 启动 Qdrant: `docker run -d --name qdrant -p 6333:6333 -p 6334:6334 qdrant/qdrant`
2. 配置知识库：在 Settings 页面填写 embedding provider 和 Qdrant 地址
3. 创建/编辑笔记，验证笔记自动写入 Qdrant
4. 新建对话，启用知识库开关
5. 提问验证知识库检索结果注入 AI 回答

---

**Spec Coverage Check:**
- [x] 整体架构（embedding + vector + chat 解耦）
- [x] Qdrant collection 和 payload 模型
- [x] settings 表配置项
- [x] conversations 表 kb_enabled/kb_scope 字段
- [x] 异步 embedding 队列
- [x] 笔记保存触发 embedding 队列
- [x] 对话检索时注入 system prompt + references
- [x] SSE done 事件携带 references
- [x] ChatView 知识库入口和面板
- [x] MessageBubble 引用展示
- [x] SettingsView 知识库配置区块
- [x] 错误处理（retry、Qdrant 不可用降级）
