# 知识库模块实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AI 对话提供笔记知识库检索能力，支持用户手动选择笔记入库、对话级开关知识库

**Architecture:** Qdrant 向量数据库存储笔记 chunk 嵌入向量，对话时检索相关片段注入 system prompt

**Tech Stack:** Qdrant (向量数据库)、阿里云 text-embedding-v4 / OpenAI 嵌入模型、better-sqlite3、Express

---

## 文件结构

**新建：**
- `server/src/services/ai/embedding-client.ts` — 统一嵌入客户端
- `server/src/services/vector/vector.service.ts` — Qdrant CRUD
- `server/src/services/knowledge-base.service.ts` — 知识库业务逻辑
- `server/src/routes/knowledge-base.routes.ts` — 路由
- `server/src/controllers/knowledge-base.controller.ts` — 控制器
- `server/src/database/migrations/007_conversations_kb_enabled.sql` — 数据库迁移

**修改：**
- `server/src/routes/index.ts` — 注册知识库路由
- `server/src/services/notes.service.ts` — 检测 is_knowledge_base 变更触发 embedding
- `server/src/services/chat.service.ts` — 对话检索知识库上下文
- `server/src/database/migrations/007_conversations_kb_enabled.sql` — 新增 conversations.kb_enabled 和 notes.is_knowledge_base 字段

**前端：**
- `src/stores/knowledge_base.store.ts` — 已有（已实现 API 调用）
- `src/views/ChatDetailView.vue` — 添加对话级 KB 开关

---

## Task 1: 数据库迁移

**Files:**
- Create: `server/src/database/migrations/007_conversations_kb_enabled.sql`

- [ ] **Step 1: 创建迁移 SQL**

```sql
ALTER TABLE conversations ADD COLUMN kb_enabled INTEGER DEFAULT 0;
ALTER TABLE notes ADD COLUMN is_knowledge_base INTEGER DEFAULT 0;
```

- [ ] **Step 2: 提交**

```bash
git add server/src/database/migrations/007_conversations_kb_enabled.sql
git commit -m "feat(kb): add kb_enabled and is_knowledge_base columns"
```

---

## Task 2: 嵌入客户端 embedding-client.ts

**Files:**
- Create: `server/src/services/ai/embedding-client.ts`
- Test: `server/src/__tests__/embedding-client.test.ts`

- [ ] **Step 1: 写测试**

```typescript
import { embedText } from '../../services/ai/embedding-client.js'

describe('embedding-client', () => {
  it('should call embedText and return vector array', async () => {
    const result = await embedText('hello world', 'qwen', 'text-embedding-v4')
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --testPathPattern=embedding-client`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: 写嵌入客户端**

```typescript
// server/src/services/ai/embedding-client.ts
import OpenAI from 'openai'
import { getSettingValue } from '../settings.service.js'

export async function embedText(
  text: string,
  provider: string,
  model: string
): Promise<number[]> {
  const aiProviders = getSettingValue<Record<string, { apiKey?: string; baseURL?: string }>>('ai_providers', {})
  const providerSettings = aiProviders[provider] || {}
  const apiKey = providerSettings.apiKey || 'sk-placeholder'
  const baseURL = providerSettings.baseURL || getDefaultBaseURL(provider)

  const client = new OpenAI({ apiKey, baseURL })
  const response = await client.embeddings.create({
    model,
    input: text
  })
  return response.data[0].embedding
}

function getDefaultBaseURL(provider: string): string {
  const baseURLs: Record<string, string> = {
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    openai: 'https://api.openai.com/v1'
  }
  return baseURLs[provider] || ''
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --testPathPattern=embedding-client`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add server/src/services/ai/embedding-client.ts server/src/__tests__/embedding-client.test.ts
git commit -m "feat(kb): add embedding client for qwen/openai providers"
```

---

## Task 3: Qdrant 向量服务 vector.service.ts

**Files:**
- Create: `server/src/services/vector/vector.service.ts`
- Test: `server/src/__tests__/vector.service.test.ts`

- [ ] **Step 1: 写测试**

```typescript
import { upsertChunks, searchChunks, deleteChunks } from '../../services/vector/vector.service.js'

describe('vector.service', () => {
  beforeAll(() => {
    // Mock Qdrant client
  })
  it('should upsert chunks to Qdrant', async () => {
    const chunks = [{
      id: 'note_1_0',
      vector: new Array(1536).fill(0.1),
      payload: { note_id: 1, chunk_index: 0, title: 'Test', content: 'Hello' }
    }]
    const result = await upsertChunks(chunks)
    expect(result).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**
Expected: FAIL

- [ ] **Step 3: 写 Qdrant 服务**

```typescript
// server/src/services/vector/vector.service.ts
import { QdrantClient } from '@qdrant/qdrant-js'
import { getSettingValue } from '../settings.service.js'

let qdrantClient: QdrantClient | null = null

function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    const url = getSettingValue<string>('qdrant_url', 'http://localhost:6333')
    qdrantClient = new QdrantClient({ url })
  }
  return qdrantClient
}

export interface Chunk {
  id: string
  vector: number[]
  payload: Record<string, unknown>
}

export async function ensureCollection(): Promise<void> {
  const client = getQdrantClient()
  const collection = getSettingValue<string>('qdrant_collection', 'notes_knowledge_base')
  const collections = await client.getCollections()
  if (!collections.collections.find(c => c.name === collection)) {
    await client.createCollection(collection, {
      vectors: { size: 1536, distance: 'Cosine' }
    })
  }
}

export async function upsertChunks(chunks: Chunk[]): Promise<boolean> {
  const client = getQdrantClient()
  const collection = getSettingValue<string>('qdrant_collection', 'notes_knowledge_base')
  try {
    await client.upsert(collection, {
      wait: true,
      points: chunks.map(c => ({
        id: c.id,
        vector: c.vector,
        payload: c.payload
      }))
    })
    return true
  } catch (e) {
    console.error('[vector] upsert failed:', e)
    return false
  }
}

export async function searchChunks(queryVector: number[], topK: number = 5): Promise<Chunk[]> {
  const client = getQdrantClient()
  const collection = getSettingValue<string>('qdrant_collection', 'notes_knowledge_base')
  try {
    const results = await client.search(collection, {
      vector: queryVector,
      limit: topK
    })
    return results.map(r => ({
      id: r.id as string,
      vector: r.vector as number[],
      payload: r.payload as Record<string, unknown>
    }))
  } catch (e) {
    console.error('[vector] search failed:', e)
    return []
  }
}

export async function deleteChunks(ids: string[]): Promise<boolean> {
  const client = getQdrantClient()
  const collection = getSettingValue<string>('qdrant_collection', 'notes_knowledge_base')
  try {
    await client.delete(collection, { points: ids })
    return true
  } catch (e) {
    console.error('[vector] delete failed:', e)
    return false
  }
}
```

- [ ] **Step 4: Run test to verify it passes**（可能因无真实 Qdrant 跳过部分断言）

- [ ] **Step 5: 提交**

```bash
git add server/src/services/vector/vector.service.ts
git commit -m "feat(kb): add Qdrant vector service for chunk storage and retrieval"
```

---

## Task 4: 知识库业务逻辑 knowledge-base.service.ts

**Files:**
- Create: `server/src/services/knowledge-base.service.ts`
- Modify: `server/src/services/notes.service.ts` — 检测 is_knowledge_base 变更触发 embedding

- [ ] **Step 1: 写知识库服务**

```typescript
// server/src/services/knowledge-base.service.ts
import { embedText } from './ai/embedding-client.js'
import { upsertChunks, searchChunks, deleteChunks, ensureCollection } from './vector/vector.service.js'
import { getSettingValue } from './settings.service.js'
import { getNoteById } from './notes.service.js'

function countTokens(text: string): number {
  // 简单估算：中文按字数，英文按空格分词
  const chinese = (text.match(/[一-龥]/g) || []).length
  const english = text.split(/\s+/).filter(Boolean).length
  return Math.ceil(chinese * 1.3 + english * 0.25)
}

function splitIntoChunks(text: string, title: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize * 2, text.length) // 粗略按字符估算
    chunks.push(text.slice(start, end))
    start += chunkSize * 2 - overlap * 2
  }
  return chunks
}

export async function triggerEmbedding(noteId: number): Promise<void> {
  const note = getNoteById(noteId)
  if (!note) return

  if (!note.is_knowledge_base) {
    // Remove from KB
    const ids = Array.from({ length: 100 }, (_, i) => `note_${noteId}_${i}`)
    await deleteChunks(ids.filter(id => id.includes(`note_${noteId}_`)))
    return
  }

  await ensureCollection()

  const chunkSize = getSettingValue<number>('kb_chunk_size', 512)
  const overlap = getSettingValue<number>('kb_chunk_overlap', 50)
  const provider = getSettingValue<string>('embedding_provider', 'qwen')
  const model = getSettingValue<string>('embedding_model', 'text-embedding-v4')

  const content = `${note.title}\n${note.content}`
  const texts = splitIntoChunks(content, note.title, chunkSize, overlap)

  for (let i = 0; i < texts.length; i++) {
    const [vector] = await Promise.all([embedText(texts[i], provider, model)])
    await upsertChunks([{
      id: `note_${noteId}_${i}`,
      vector,
      payload: {
        note_id: noteId,
        chunk_index: i,
        title: note.title,
        content: texts[i]
      }
    }])
  }
}

export interface SearchResult {
  note_id: number
  title: string
  content: string
  score: number
}

export async function searchKnowledgeBase(query: string, topK: number = 5): Promise<SearchResult[]> {
  const provider = getSettingValue<string>('embedding_provider', 'qwen')
  const model = getSettingValue<string>('embedding_model', 'text-embedding-v4')

  const [queryVector] = await Promise.all([embedText(query, provider, model)])
  const chunks = await searchChunks(queryVector, topK)

  return chunks.map(c => ({
    note_id: c.payload.note_id as number,
    title: c.payload.title as string,
    content: c.payload.content as string,
    score: 0 // Qdrant 返回的 score 在 searchChunks 中需返回
  }))
}

export function getKnowledgeBaseConfig() {
  return {
    enabled: getSettingValue<boolean>('kb_enabled', false),
    embedding_provider: getSettingValue<string>('embedding_provider', 'qwen'),
    embedding_model: getSettingValue<string>('embedding_model', 'text-embedding-v4'),
    qdrant_url: getSettingValue<string>('qdrant_url', 'http://localhost:6333'),
    qdrant_collection: getSettingValue<string>('qdrant_collection', 'notes_knowledge_base'),
    kb_chunk_size: getSettingValue<number>('kb_chunk_size', 512),
    kb_chunk_overlap: getSettingValue<number>('kb_chunk_overlap', 50)
  }
}

export async function rebuildAllIndex(): Promise<{ total: number; success: number }> {
  // TODO: 实现全量重建
  return { total: 0, success: 0 }
}
```

- [ ] **Step 2: 修改 notes.service.ts 在 updateNote 中触发 embedding**

在 `updateNote` 函数中，检测 `data.is_knowledge_base` 变更后调用 `triggerEmbedding`

- [ ] **Step 3: 提交**

```bash
git add server/src/services/knowledge-base.service.ts server/src/services/notes.service.ts
git commit -m "feat(kb): add knowledge base service with embedding trigger"
```

---

## Task 5: 路由和控制器

**Files:**
- Create: `server/src/routes/knowledge-base.routes.ts`
- Create: `server/src/controllers/knowledge-base.controller.ts`
- Modify: `server/src/routes/index.ts` — 注册路由

- [ ] **Step 1: 写控制器**

```typescript
// server/src/controllers/knowledge-base.controller.ts
import { Request, Response } from 'express'
import * as kbService from '../services/knowledge-base.service.js'
import { getSettingValue, setSetting } from '../services/settings.service.js'

export async function getConfig(req: Request, res: Response) {
  res.json(kbService.getKnowledgeBaseConfig())
}

export async function updateConfig(req: Request, res: Response) {
  const { enabled, embedding_provider, embedding_model, qdrant_url, qdrant_collection, kb_chunk_size, kb_chunk_overlap } = req.body
  if (enabled !== undefined) setSetting('kb_enabled', enabled)
  if (embedding_provider !== undefined) setSetting('embedding_provider', embedding_provider)
  if (embedding_model !== undefined) setSetting('embedding_model', embedding_model)
  if (qdrant_url !== undefined) setSetting('qdrant_url', qdrant_url)
  if (qdrant_collection !== undefined) setSetting('qdrant_collection', qdrant_collection)
  if (kb_chunk_size !== undefined) setSetting('kb_chunk_size', kb_chunk_size)
  if (kb_chunk_overlap !== undefined) setSetting('kb_chunk_overlap', kb_chunk_overlap)
  res.json({ success: true })
}

export async function rebuildIndex(req: Request, res: Response) {
  res.json({ message: 'rebuild started' })
  // 异步执行，不阻塞
  kbService.rebuildAllIndex().catch(console.error)
}

export async function triggerEmbedding(req: Request, res: Response) {
  const { source_type, source_id } = req.body
  if (source_type === 'note') {
    await kbService.triggerEmbedding(source_id)
  }
  res.json({ success: true })
}

export async function deleteDocument(req: Request, res: Response) {
  res.json({ success: true })
}
```

- [ ] **Step 2: 写路由**

```typescript
// server/src/routes/knowledge-base.routes.ts
import { Router } from 'express'
import * as kbController from '../controllers/knowledge-base.controller.js'

export const knowledgeBaseRouter = Router()

knowledgeBaseRouter.get('/config', kbController.getConfig)
knowledgeBaseRouter.put('/config', kbController.updateConfig)
knowledgeBaseRouter.post('/rebuild', kbController.rebuildIndex)
knowledgeBaseRouter.post('/trigger', kbController.triggerEmbedding)
knowledgeBaseRouter.delete('/documents/:id', kbController.deleteDocument)
```

- [ ] **Step 3: 在 routes/index.ts 注册路由**

- [ ] **Step 4: 提交**

```bash
git add server/src/routes/knowledge-base.routes.ts server/src/controllers/knowledge-base.controller.ts server/src/routes/index.ts
git commit -m "feat(kb): add knowledge base API routes and controller"
```

---

## Task 6: 对话集成知识库

**Files:**
- Modify: `server/src/services/chat.service.ts` — 注入知识库上下文
- Modify: `server/src/routes/chat.routes.ts` — 新增 PATCH /conversations/:id/kb

- [ ] **Step 1: 修改 chat.service.ts 在 streamChat 开头注入知识库上下文**

在构建 messages 数组前，检测 conversation.kb_enabled，若为 true 则：
1. 调用 `searchKnowledgeBase(userContent, topK)`
2. 构建 system prompt 片段注入 messages

- [ ] **Step 2: 在 chat.routes.ts 添加对话级 KB 开关路由**

```typescript
chatRouter.patch('/:id/kb', (req, res) => {
  const { id } = req.params
  const { kb_enabled } = req.body
  updateConversation(Number(id), { kb_enabled })
  res.json({ success: true })
})
```

- [ ] **Step 3: 提交**

```bash
git add server/src/services/chat.service.ts server/src/routes/chat.routes.ts
git commit -m "feat(kb): integrate knowledge base retrieval into chat streaming"
```

---

## Task 7: 前端对话级 KB 开关

**Files:**
- Modify: `src/views/ChatDetailView.vue` — 添加 KB 开关 UI

- [ ] **Step 1: 在 ChatDetailView.vue 对话详情页添加知识库开关**

位置：对话标题/设置区域，添加开关控件

- [ ] **Step 2: 提交**

```bash
git add src/views/ChatDetailView.vue
git commit -m "feat(kb): add knowledge base toggle in chat detail view"
```