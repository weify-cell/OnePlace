# 知识库模块设计

## 概述

基于 Qdrant 向量数据库 + 阿里云 text-embedding-v4 嵌入模型，为 AI 对话提供笔记知识库检索能力。用户可手动选择将哪些笔记加入知识库，对话级别独立控制是否启用知识库检索。

## 架构

```
笔记保存
  └─→ 用户手动勾选"加入知识库"
       └─→ notes.is_knowledge_base = true
            └─→ embedding-client 生成向量
                 └─→ vector.service 写入 Qdrant

AI 对话
  └─→ 用户在对话详情开启"知识库"
       └─→ conversations.kb_enabled = true
            └─→ 用户发送消息
                 └─→ 检索 Qdrant 最相关 chunks
                      └─→ 构建 system prompt 注入 chat
```

## 目录结构

```
server/src/
├── services/
│   ├── ai/
│   │   └── embedding-client.ts    # 统一嵌入客户端（qwen/openai等）
│   ├── vector/
│   │   └── vector.service.ts       # Qdrant CRUD（upsert/search/delete）
│   └── knowledge-base.service.ts   # 知识库业务逻辑
├── routes/
│   └── knowledge-base.routes.ts    # API 路由
├── controllers/
│   └── knowledge-base.controller.ts
└── database/migrations/
    └── 007_conversations_kb_enabled.sql  # 新增 conversations.kb_enabled 字段
```

## 数据库变更

**migrations/007_conversations_kb_enabled.sql**
```sql
ALTER TABLE conversations ADD COLUMN kb_enabled INTEGER DEFAULT 0;
ALTER TABLE notes ADD COLUMN is_knowledge_base INTEGER DEFAULT 0;
```

## API 端点

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/knowledge-base/config` | 获取配置（provider/model/collection） |
| PUT | `/api/knowledge-base/config` | 更新配置 |
| POST | `/api/knowledge-base/rebuild` | 全量重建索引 |
| POST | `/api/knowledge-base/trigger` | 触发单条笔记 embedding（笔记更新时自动调用） |
| DELETE | `/api/knowledge-base/documents/:id` | 从 KB 删除 |
| PATCH | `/api/conversations/:id/kb` | 开关对话级 KB |

## 配置项（存 settings 表）

- `embedding_provider`（默认 `qwen`）
- `embedding_model`（默认 `text-embedding-v4`）
- `embedding_api_key`
- `qdrant_url`（默认 `http://localhost:6333`）
- `qdrant_collection`（默认 `notes_knowledge_base`）
- `kb_chunk_size`（默认 512 tokens）
- `kb_chunk_overlap`（默认 50 tokens）

## 核心逻辑

### 笔记 → 向量入库

1. 用户在笔记编辑页勾选"加入知识库"，调用 `PATCH /api/notes/:id` 设置 `is_knowledge_base: true`
2. 后端 `notes.service.updateNote` 检测到 `is_knowledge_base` 变更，调用 `knowledgeBaseService.triggerEmbedding(noteId)`
3. `embedding-client` 调用嵌入模型生成向量
4. `vector.service.upsertChunks` 写入 Qdrant（按 chunk_size / chunk_overlap 切分）
5. 笔记内容变更时（title/content），自动重新 trigger embedding

### 对话 → 知识库检索

1. 用户在对话详情页开启"知识库"，调用 `PATCH /api/conversations/:id/kb` 设置 `kb_enabled: true`
2. 用户发送消息，`chat.service.streamChat` 检测到 `kb_enabled` 为 true
3. 调用 `knowledgeBaseService.buildContext(conversationId, userQuery)`：
   - 用户 query 嵌入
   - Qdrant search 返回 topK 相关 chunks
   - 构建 system prompt：`[参考片段1]...\n\n[参考片段2]...`
4. 将 system prompt 注入 messages 列表头部

## Chunk 切分策略

- 按 token 数切分（tiktoken 或简单空格/字符估算）
- 相邻 chunk 有 `kb_chunk_overlap` 重叠，保持上下文连贯性
- 笔记 title 作为每个 chunk 的 metadata 存储

## 错误处理

- Qdrant 不可用时：知识库功能降级，对话正常走纯 LLM，提示用户检查 KB 配置
- 嵌入 API 失败时：重试 1 次，失败记录 error log，不阻塞对话