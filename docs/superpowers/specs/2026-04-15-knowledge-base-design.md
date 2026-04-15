# 知识库功能设计文档

## 一、整体架构

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (Vue)                      │
│  ChatView / SettingsView / KnowledgeBase Settings      │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTP / SSE
┌─────────────────────────▼───────────────────────────────┐
│                   Express API (server/)                  │
│  chat.controller / notes.controller / settings.controller│
└──────┬────────────────┬──────────────────┬───────────────┘
       │                │                  │
       ▼                ▼                  ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐
│chat.service  │  │notes.service │  │ settings.service    │
│             │  │ (async sync) │  │ (config storage)    │
└──────┬──────┘  └──────┬──────┘  └─────────────────────┘
       │                │                  │
       ▼                ▼                  ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐
│AI Provider   │  │embedding.   │  │ settings table      │
│(chat only)   │  │service.ts   │  │ (provider configs)   │
└─────────────┘  └──────┬──────┘  └─────────────────────┘
       │                │
       │         ┌──────▼──────┐
       │         │vector.service│
       │         │  .ts         │
       │         └──────┬──────┘
       │                │
       │         ┌──────▼──────┐
       │         │   Qdrant     │
       │         │  (Docker)   │
       │         └─────────────┘
       │
       ▼
┌─────────────┐
│  SQLite DB   │
└─────────────┘
```

**要点：**
- `embedding.service.ts` 仅依赖配置（provider + api key），不参与对话逻辑
- `vector.service.ts` 仅依赖 Qdrant，与 embedding provider 解耦
- 两者通过 `notes.service.ts` 的保存钩子串联，形成数据流：`笔记保存 → 触发embedding → 写入Qdrant`
- 对话检索时，`chat.service.ts` 调用 `vector.service.ts` 召回结果，注入到 AI 请求中

---

## 二、数据模型

### 2.1 Qdrant Collection

Collection 名称：`notes_knowledge_base`

```typescript
interface NoteChunk {
  chunk_id: string;      // "note_{id}_{chunk_index}"
  note_id: number;       // 关联 notes.id
  title: string;         // 笔记标题（用于展示引用来源）
  content: string;       // 段落原文
  tags: string[];        // 笔记标签
  folder_id: number | null;
  created_at: string;
}

interface QdrantPayload {
  chunk_id: string;
  note_id: number;
  title: string;
  content: string;
  tags: string[];
  folder_id: number | null;
  created_at: string;
}
```

**向量维度：** 取决于 embedding provider（阿里 qwen-embedding: 1024，OpenAI: 1536）
**Distance：** Cosine
**索引字段：** note_id（用于删除时定位）、tags（可选过滤）

---

### 2.2 settings 表配置项

```typescript
// 知识库全局开关
kb_enabled: boolean  // true = 知识库功能启用

// Embedding provider 配置
embedding_provider: string  // 'qwen' | 'openai' | 'cohere' 等
embedding_api_key: string
embedding_model: string     // 如 'text-embedding-3-small'

// Qdrant 连接配置
qdrant_url: string          // 'http://localhost:6333'
qdrant_collection: string   // 'notes_knowledge_base'

// 检索参数
kb_top_k: number            // 默认 5
kb_chunk_size: number        // 默认 500
kb_chunk_overlap: number     // 默认 50
kb_default_enabled: boolean   // 新对话默认关闭
```

---

### 2.3 conversations 表扩展

```sql
ALTER TABLE conversations ADD COLUMN kb_enabled INTEGER DEFAULT 0;
ALTER TABLE conversations ADD COLUMN kb_scope TEXT DEFAULT 'all';
-- kb_scope: 'all' | 'folder:{id}' | 'tag:{tag}'
```

---

### 2.4 异步任务队列

采用简单的 **in-process 队列**，避免额外消息队列依赖：

```typescript
// server/src/services/vector/embedding-queue.ts
interface EmbeddingTask {
  noteId: number;
  action: 'upsert' | 'delete';
  timestamp: number;
}

const taskQueue: EmbeddingTask[] = [];
let isProcessing = false;

export function enqueueEmbeddingTask(task: EmbeddingTask) {
  taskQueue.push(task);
  if (!isProcessing) processQueue();
}

async function processQueue() {
  isProcessing = true;
  while (taskQueue.length > 0) {
    const task = taskQueue.shift();
    await processTask(task);
  }
  isProcessing = false;
}
```

笔记保存时将任务加入队列，后台异步处理，不阻塞主流程。

---

## 三、API 与异步处理流程

### 3.1 新增后端 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/settings/knowledge-base` | 获取知识库配置 |
| `PUT` | `/api/settings/knowledge-base` | 更新知识库配置（provider, Qdrant, 参数） |
| `POST` | `/api/knowledge-base/rebuild` | 手动触发全量索引重建 |
| `GET` | `/api/knowledge-base/stats` | 返回索引笔记数量、chunk 数量 |

`conversations` 表的 `kb_enabled` 字段通过已有的 `updateConversation` 接口管理（扩展 `data` 参数即可）。

---

### 3.2 笔记保存 → Qdrant 写入流程

```
POST /api/notes/{id} (updateNote)
        │
        ▼
notes.service.ts::updateNote()
        │
        ├──► SQLite 更新（同步，主流程）
        │
        └──► enqueueEmbeddingTask({ noteId, action: 'upsert' })
                    │
                    ▼
            embedding-queue.ts（后台异步）
                    │
                    ▼
            ┌────────────────────────┐
            │ 1. getNoteById(id)    │
            │ 2. splitIntoChunks()   │  ← 按段落分块
            │ 3. embeddingProvider   │
            │    .embed(text)        │  ← 调用配置的 provider
            │ 4. vectorService.     │
            │    upsertChunks()      │  ← 写入 Qdrant
            └────────────────────────┘
```

笔记删除同理，`action: 'delete'` 时调用 `vectorService.deleteByNoteId(noteId)`。

---

### 3.3 对话检索流程

```
POST /api/conversations/{id}/chat
        │
        ▼
chat.service.ts::streamChat()
        │
        ├──► 检查 conversation.kb_enabled
        │         │
        │         ▼（kb_enabled = true）
        │    vectorService.search(userQuery, topK)
        │         │
        │         ▼
        │    返回: { chunks: [...], references: [...] }
        │         │
        └──► 将 chunks 拼入 system prompt
                   │
                   ▼
            AI Stream Response
                   │
                   ▼
            SSE 'done' 事件携带 references
                   │
                   ▼
            前端渲染"参考了 X 篇笔记"可展开列表
```

---

### 3.4 system prompt 注入格式

```typescript
const systemPrompt = `你是一个助手。当用户提问时，如果提供了参考笔记片段，请结合这些内容回答。
如果参考内容中没有相关信息，请如实告知。

## 参考笔记
${chunks.map((c, i) => `[${i+1}] ${c.title}: ${c.content}`).join('\n\n')}

## 回答要求
- 基于上述参考内容回答，如果涉及多个笔记，请综合整理
- 如果参考内容无法回答问题，请说明"根据当前知识库无法回答该问题"`;
```

---

## 四、前端设计

### 4.1 知识库设置入口

在 `ChatView` 顶部 header 区域（模型 badge 旁边）添加一个"知识库"图标按钮：

```vue
<!-- ChatView.vue header 区域 -->
<div class="chat-header__meta">
  <div class="chat-header__badge">...</div>
  <span class="chat-header__provider">...</span>

  <!-- 新增：知识库设置入口 -->
  <n-tooltip trigger="hover">
    <template #trigger>
      <div
        class="chat-header__kb-btn"
        :class="{ 'chat-header__kb-btn--active': kbSettingsVisible }"
        @click="kbSettingsVisible = !kbSettingsVisible"
      >
        <span>📚</span>
      </div>
    </template>
    {{ chatStore.currentConversation?.kb_enabled ? '知识库：已启用' : '知识库：已关闭' }}
  </n-tooltip>
</div>
```

点击后展开/收起设置面板（使用 NCollapse 或下拉面板）。

---

### 4.2 知识库设置面板

```
┌──────────────────────────────────────────┐
│ 📚 知识库设置                              │
├──────────────────────────────────────────┤
│ 启用知识库    [开关]                       │
│                                          │
│ 检索范围      ○ 全部笔记                    │
│              ○ 指定文件夹                  │
│              ○ 指定标签                    │
│                                          │
│ Top K       [====●=====] 5              │
│ 每次对话召回的参考笔记数量                    │
│                                          │
│ [重建索引]                              │
│ 已索引：128 篇笔记 / 356 个段落            │
└──────────────────────────────────────────┘
```

---

### 4.3 引用来源展示

在 `MessageBubble` 中，AI 回答后如果携带 references，渲染为可展开的引用列表：

```
┌────────────────────────────────────┐
│ AI 的回答内容...                    │
│                                    │
│ 📚 参考了 3 篇笔记 [▼ 展开]         │
│ ┌──────────────────────────────┐   │
│ │ [1] 项目会议记录              │   │
│ │     确定了本周的主要任务...    │   │
│ ├──────────────────────────────┤   │
│ │ [2] 技术方案讨论              │   │
│ │     决定使用 Qdrant 作为...   │   │
│ └──────────────────────────────┘   │
└────────────────────────────────────┘
```

---

### 4.4 Settings 页面扩展

在 `SettingsView` 中新增"知识库"区块，用于配置 embedding provider 和 Qdrant 连接信息：

```
┌─────────────────────────────────────────────┐
│ 知识库配置                                   │
├─────────────────────────────────────────────┤
│ 启用知识库功能    [开关]                      │
│                                             │
│ Embedding 服务商   [通义千问 ▼]              │
│ API Key          [●●●●●●●●●●●●●]           │
│ 模型             [qwen-embedding-text ▼]    │
│                                             │
│ Qdrant 地址      [http://localhost:6333  ]  │
│ Collection      [notes_knowledge_base    ]  │
│                                             │
│ 分块大小         [500] 字                   │
│ 重叠字数         [50]  字                   │
│ 默认启用         [关闭]                     │
│                                             │
│ [ ] 连接测试   [保存配置]                    │
└─────────────────────────────────────────────┘
```

---

### 4.5 消息列表 SSE 事件扩展

`done` 事件新增字段：

```typescript
// chat.store.ts 解析
if (event === 'done') {
  const assistantMessage: Message = {
    // ... existing fields
  }
  if (parsed.references) {
    assistantMessage.references = parsed.references
  }
}
```

前端 `MessageBubble` 根据 `references` 字段渲染引用列表。

---

## 五、错误处理与边界情况

### 5.1 Embedding 服务不可用

当 `embedding.service.ts` 调用失败（API 超时、key 无效等）：
- 捕获异常，记录 error log，但不阻断笔记保存
- 重试 3 次，间隔 1s/2s/4s（指数退避）
- 3 次都失败则跳过该笔记，后续可通过"重建索引"补救

```typescript
async function embedWithRetry(text: string, retries = 3): Promise<number[]> {
  for (let i = 0; i < retries; i++) {
    try {
      return await embeddingService.embed(text);
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(1000 * Math.pow(2, i));
    }
  }
  return [];
}
```

---

### 5.2 Qdrant 不可用

当 `vector.service.ts` 查询/写入失败时：
- **写入失败**：笔记已保存，仅 embedding 任务失败，不影响用户
- **检索失败**：记录 error log，对话继续以无知识库模式响应，AI 回答不受影响
- 前端可显示 toast 提示"知识库暂不可用"

---

### 5.3 向量维度不一致

不同 embedding provider 生成的向量维度不同（如 qwen 1024 vs OpenAI 1536）。Qdrant collection 在创建时指定维度：

```typescript
// vector.service.ts
async function ensureCollection(provider: string) {
  const dimension = getEmbeddingDimension(provider); // 从配置读取
  await qdrant.createCollection({
    collection_name: COLLECTION_NAME,
    vectors_config: { size: dimension, distance: 'Cosine' }
  });
}
```

用户切换 provider 时需重建索引，前端在 provider 变更时给出警告提示。

---

### 5.4 笔记内容为空或过短

- 单段少于 10 字：跳过，不生成 chunk
- 全篇笔记无有效段落：删除该笔记在 Qdrant 中的所有记录

---

### 5.5 全量重建索引

用户手动触发重建时：
- 先删除整个 collection，再重建
- 分批处理（如每 50 篇笔记一批），避免内存溢出
- 前端显示进度条（通过 SSE 或轮询进度接口）

---

### 5.6 冷启动

新部署时 Qdrant 中无数据：
- 知识库开关默认关闭，不影响正常对话
- 用户配置好 embedding + Qdrant 后，可手动触发"重建索引"或等待首次笔记保存时自动写入

---

## 六、实现文件清单

### 后端（server/src/）

| 文件 | 职责 |
|------|------|
| `services/ai/embedding-client.ts` | Embedding 服务调用，支持多 provider |
| `services/vector/vector.service.ts` | Qdrant CRUD 操作 |
| `services/vector/embedding-queue.ts` | 异步 embedding 任务队列 |
| `services/knowledge-base.service.ts` | 知识库业务逻辑（检索、分块） |
| `routes/knowledge-base.routes.ts` | 知识库 API 路由 |
| `controllers/knowledge-base.controller.ts` | 知识库 API 控制器 |
| `routes/notes.routes.ts` | 扩展 notes 路由以支持异步触发 |
| `services/chat.service.ts` | 扩展 streamChat 支持知识库注入 |
| `services/notes.service.ts` | 扩展 create/update/delete 触发 embedding 队列 |
| `database/migrations/` | 新增 migration 扩展 conversations 表 |

### 前端（src/）

| 文件 | 职责 |
|------|------|
| `api/knowledge-base.api.ts` | 知识库配置 API 调用 |
| `stores/chat.store.ts` | 扩展 messages 支持 references 字段 |
| `views/ChatView.vue` | 新增知识库设置入口和面板 |
| `components/chat/KnowledgeBasePanel.vue` | 知识库设置面板组件 |
| `components/chat/MessageBubble.vue` | 扩展支持引用来源展示 |
| `views/SettingsView.vue` | 新增知识库配置区块 |
| `types/index.ts` | 扩展 Message 类型支持 references |
