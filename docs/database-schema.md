# OnePlace 数据库表结构

> 数据库：SQLite（better-sqlite3，同步 API，WAL 模式）
> 连接入口：`server/src/database/index.ts` 的 `connectDatabase()`，单例，`foreign_keys = ON`
> 迁移机制：`server/src/database/migrate.ts` 的 `runMigrations()`，按文件名排序执行 `server/src/database/migrations/*.sql`，`_migrations` 表去重，幂等
> 本文档以**实际运行数据库**（`data/oneplace.db`）为基准整理，与迁移文件有出入的列已用 ⚠️ 标注（孤儿列/遗留列，当前代码未读写）。

---

## 表清单

| # | 表名 | 说明 | 状态 |
|---|------|------|------|
| 1 | `todos` | 待办任务 | ✅ 使用中 |
| 2 | `notes` | 笔记（Markdown / Tiptap JSON） | ✅ 使用中 |
| 3 | `conversations` | AI 对话会话 | ✅ 使用中 |
| 4 | `messages` | 对话消息 | ✅ 使用中 |
| 5 | `settings` | 全局键值配置（含所有运行时配置） | ✅ 使用中 |
| 6 | `folders` | 笔记文件夹 | ✅ 使用中 |
| 7 | `wechat_messages` | 微信 Bot 消息历史 | ✅ 使用中 |
| 8 | `todo_progress_logs` | 长期待办进度日志 | ✅ 使用中 |
| 9 | `tools` | Agent 工具（DB 驱动） | ✅ 使用中 |
| 10 | `skills` | Agent 技能（DB 驱动） | ✅ 使用中 |
| 11 | `tool_categories` | 工具分类 | ✅ 使用中 |
| 12 | `skills_categories` | 技能分类 | ✅ 使用中 |
| 13 | `embedding_tasks` | ⚠️ 遗留表，当前代码未读写 | ⚠️ 孤儿 |
| 14 | `_migrations` | 迁移跟踪表（基础设施） | ✅ 使用中 |
| 15 | `_notes_old_20260419*` | 重建 notes 表时遗留的备份表（3 张） | ⚠️ 遗留 |
| 16 | `wechat_reports` | 微信日报/周报/月报 | ✅ 使用中 |

---

## 1. `todos` — 待办任务

| 字段 | 类型 | 约束/默认 | 注释 |
|------|------|-----------|------|
| id | INTEGER | PK, AUTOINCREMENT | 主键 |
| title | TEXT | NOT NULL | 任务标题 |
| description | TEXT | NULL | 任务描述 |
| priority | TEXT | NOT NULL DEFAULT 'medium' | 优先级：`low` / `medium` / `high` / `urgent` |
| status | TEXT | NOT NULL DEFAULT 'todo' | 状态：`todo` / `in_progress` / `done` / `cancelled` |
| type | TEXT | DEFAULT NULL | 分类：`work` / `study` / `personal` / `health` / `finance` / `family` |
| due_date | TEXT | DEFAULT NULL | 截止日期，格式 `YYYY-MM-DD` |
| tags | TEXT | NOT NULL DEFAULT '[]' | 标签，JSON 数组字符串 |
| is_deleted | INTEGER | NOT NULL DEFAULT 0 | 软删除标记（0=正常，1=已删除） |
| created_at | TEXT | NOT NULL DEFAULT (now) | 创建时间 ISO8601 |
| updated_at | TEXT | NOT NULL DEFAULT (now) | 更新时间 ISO8601 |
| completed_at | DATETIME | DEFAULT NULL | 完成时间（迁移 006） |
| is_knowledge_base | INTEGER | DEFAULT 0 | ⚠️ 孤儿列，当前代码未读写（遗留） |
| reminder_time | TEXT | DEFAULT NULL | 提醒时间，格式 `YYYY-MM-DD HH:mm`（迁移 011） |
| reminder_enabled | INTEGER | DEFAULT 1 | 是否启用提醒；短期任务提醒后置 0，长期任务顺延一天（迁移 011） |
| task_kind | TEXT | NOT NULL DEFAULT 'one_time' | 任务类型：`one_time`（一次性）/ `long_term`（长期，进度管理+自动顺延提醒）（迁移 016） |
| progress_percent | INTEGER | DEFAULT NULL | 长期任务进度百分比（迁移 017） |
| last_progress_note | TEXT | DEFAULT NULL | 最近一次进度备注（迁移 017） |

```sql
CREATE TABLE todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','done','cancelled')),
  type TEXT DEFAULT NULL CHECK(type IS NULL OR type IN ('work','study','personal','health','finance','family')),
  due_date TEXT DEFAULT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at DATETIME DEFAULT NULL,
  is_knowledge_base INTEGER DEFAULT 0,
  reminder_time TEXT,
  reminder_enabled INTEGER DEFAULT 1,
  task_kind TEXT NOT NULL DEFAULT 'one_time',
  progress_percent INTEGER DEFAULT NULL,
  last_progress_note TEXT DEFAULT NULL
);
```

索引：

```sql
CREATE INDEX idx_todos_status   ON todos(status)   WHERE is_deleted = 0;
CREATE INDEX idx_todos_priority ON todos(priority) WHERE is_deleted = 0;
CREATE INDEX idx_todos_type     ON todos(type)     WHERE is_deleted = 0;
CREATE INDEX idx_todos_created  ON todos(created_at DESC);
```

---

## 2. `notes` — 笔记

| 字段 | 类型 | 约束/默认 | 注释 |
|------|------|-----------|------|
| id | INTEGER | PK, AUTOINCREMENT | 主键 |
| title | TEXT | NOT NULL DEFAULT '无标题' | 标题 |
| content | TEXT | NOT NULL DEFAULT '' | 原始内容（`content_format` 决定是 Tiptap JSON 还是 Markdown） |
| content_text | TEXT | DEFAULT '' | 从 content 提取的纯文本 |
| tags | TEXT | NOT NULL DEFAULT '[]' | 标签，JSON 数组字符串 |
| is_pinned | INTEGER | NOT NULL DEFAULT 0 | 置顶标记 |
| is_archived | INTEGER | NOT NULL DEFAULT 0 | 归档标记 |
| is_deleted | INTEGER | NOT NULL DEFAULT 0 | 软删除标记 |
| created_at | TEXT | NOT NULL DEFAULT (now) | 创建时间 |
| updated_at | TEXT | NOT NULL DEFAULT (now) | 更新时间 |
| folder_id | INTEGER | DEFAULT NULL | 所属文件夹，外键 → `folders.id`（迁移 004） |
| content_format | TEXT | NOT NULL DEFAULT 'tiptap' | 内容格式：`tiptap`（旧版 JSON，仅展示）/ `markdown`（新版）（迁移 005） |
| is_knowledge_base | INTEGER | NOT NULL DEFAULT 0 | 是否加入知识库（置 1 时触发 embedding 写入 Qdrant） |

> 注：该表曾因历史原因重建过（`_notes_old_20260419*` 备份表即重建前的旧表）。当前定义与迁移文件 001/004/005 的组合一致，`is_knowledge_base` 为运行时补齐列（迁移 007 实际为 no-op）。

```sql
CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '无标题',
  content TEXT NOT NULL DEFAULT '',
  content_text TEXT DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  is_pinned INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  folder_id INTEGER DEFAULT NULL,
  content_format TEXT NOT NULL DEFAULT 'tiptap',
  is_knowledge_base INTEGER NOT NULL DEFAULT 0
);
```

索引：

```sql
CREATE INDEX idx_notes_folder  ON notes(folder_id);
CREATE INDEX idx_notes_pinned  ON notes(is_pinned);
CREATE INDEX idx_notes_updated ON notes(updated_at DESC);
```

---

## 3. `conversations` — AI 对话会话

| 字段 | 类型 | 约束/默认 | 注释 |
|------|------|-----------|------|
| id | INTEGER | PK, AUTOINCREMENT | 主键 |
| title | TEXT | NOT NULL DEFAULT '新对话' | 会话标题（首条消息后自动取前 30 字） |
| model | TEXT | NOT NULL DEFAULT 'qwen-turbo' | AI 模型 |
| provider | TEXT | NOT NULL DEFAULT 'qwen' | AI 提供商 |
| is_deleted | INTEGER | NOT NULL DEFAULT 0 | 软删除标记 |
| created_at | TEXT | NOT NULL DEFAULT (now) | 创建时间 |
| updated_at | TEXT | NOT NULL DEFAULT (now) | 更新时间 |
| kb_enabled | INTEGER | DEFAULT 0 | 是否启用知识库检索（迁移 007 声明，运行时补齐列） |
| kb_scope | TEXT | DEFAULT 'all' | ⚠️ 孤儿列，当前代码未读写（遗留） |
| test_kb | INTEGER | NULL | ⚠️ 孤儿列，当前代码未读写（遗留） |
| tools_enabled | INTEGER | DEFAULT 0 | 是否启用 Agent 工具（迁移 009） |
| max_tool_rounds | INTEGER | DEFAULT 5 | 最大工具调用轮数（迁移 009） |

```sql
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '新对话',
  model TEXT NOT NULL DEFAULT 'qwen-turbo',
  provider TEXT NOT NULL DEFAULT 'qwen',
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  kb_enabled INTEGER DEFAULT 0,
  kb_scope TEXT DEFAULT 'all',
  test_kb INTEGER,
  tools_enabled INTEGER DEFAULT 0,
  max_tool_rounds INTEGER DEFAULT 5
);
```

索引：

```sql
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC) WHERE is_deleted = 0;
```

---

## 4. `messages` — 对话消息

| 字段 | 类型 | 约束/默认 | 注释 |
|------|------|-----------|------|
| id | INTEGER | PK, AUTOINCREMENT | 主键 |
| conversation_id | INTEGER | NOT NULL, FK → conversations.id, ON DELETE CASCADE | 所属会话 |
| role | TEXT | NOT NULL CHECK | 角色：`user` / `assistant` / `system` |
| content | TEXT | NOT NULL DEFAULT '' | 消息内容 |
| tokens_used | INTEGER | NULL | 消耗 token 数 |
| is_error | INTEGER | NOT NULL DEFAULT 0 | 是否错误消息 |
| created_at | TEXT | NOT NULL DEFAULT (now) | 创建时间 |
| kb_citations | TEXT | NULL | 知识库引用，JSON 数组字符串（迁移 008） |
| tool_calls | TEXT | NULL | 工具调用记录，JSON（迁移 009） |

```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
  content TEXT NOT NULL DEFAULT '',
  tokens_used INTEGER DEFAULT NULL,
  is_error INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  kb_citations TEXT,
  tool_calls TEXT
);
```

索引：

```sql
CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);
```

---

## 5. `settings` — 全局键值配置

| 字段 | 类型 | 约束/默认 | 注释 |
|------|------|-----------|------|
| key | TEXT | PK, NOT NULL | 配置键 |
| value | TEXT | NOT NULL DEFAULT '' | 值，**JSON 编码**（数字/布尔/对象都序列化为字符串） |
| description | TEXT | NOT NULL DEFAULT '' | 配置描述，说明该 key 的用途（界面展示用，迁移 022 新增） |
| updated_at | TEXT | NOT NULL DEFAULT (now) | 最后更新时间 |

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

> `description` 列由迁移 `022_settings_description.sql` 追加，位于物理列序末尾（`key, value, updated_at, description`）。

### 常用 key 语义

| key | value 语义 | 来源 |
|-----|-----------|------|
| `password_hash` | 登录密码哈希 | 迁移 003 |
| `theme` | 前端主题 | 迁移 003 |
| `default_provider` / `default_model` | 默认 AI 提供商 / 模型 | 迁移 003 |
| `ai_providers` | AI 提供商配置 JSON（含 apiKey、模型列表、baseURL） | 迁移 003 |
| `embedding_provider` / `embedding_model` | 知识库 embedding 提供商 / 模型 | 代码写入 |
| `kb_enabled` / `kb_top_k` / `kb_score_threshold` | 知识库总开关 / 检索 top-K / 阈值 | 代码写入 |
| `kb_chunk_size` / `kb_chunk_overlap` | 切块大小 / 重叠 | 代码写入 |
| `kb_rerank_provider` / `kb_rerank_model` / `kb_rerank_recall_size` | rerank 配置 | 代码写入 |
| `qdrant_url` / `qdrant_collection` | Qdrant 地址 / collection 名 | 代码写入 |
| `ilink_enabled` | 微信 Bot 总开关 | 迁移 010 |
| `ilink_bot_token` / `ilink_api_base_url` | iLink 协议 token / base URL | 迁移 010 |
| `ilink_provider` / `ilink_model` / `ilink_system_prompt` | Bot 提供商 / 模型 / 人设 | 迁移 010 |
| `ilink_max_tool_rounds` | Bot 最大工具轮数 | 迁移 010 |
| `ilink_reminder_enabled` / `ilink_reminder_interval` | 提醒服务开关 / 间隔（分钟） | 迁移 010 |
| `ilink_proactive_chat_enabled` / `_min_interval` / `_quiet_hours_start` / `_quiet_hours_end` / `_check_interval` | 主动聊天运行参数 | 迁移 012 |
| `ilink_proactive_chat_system_prompt` / `_user_message` | 主动聊天人设 / 触发指令 | 迁移 012 |
| `ilink_tool_usage_prompt` | 旧版工具使用提示词（已迁移到 note_tools_prompt） | 迁移 014 |
| `note_tools_prompt` | 笔记工具使用提示词（Bot / 聊天 / 主动模式共享） | 迁移 015 |
| `ilink_learning_prompt` | 学习模式 system prompt（`{topic}` 占位符） | 代码写入 |
| `ilink_user_{userId}` | **运行时**：记录该微信用户存在；`updated_at` = 用户最后发消息时间 | 代码写入（saveWeChatUser） |
| `ilink_proactive_last_sent_{userId}` | **运行时**：该用户上次主动消息发送时间戳（ms） | 代码写入（setDbLastSentTime） |

---

## 6. `folders` — 笔记文件夹

| 字段 | 类型 | 约束/默认 | 注释 |
|------|------|-----------|------|
| id | INTEGER | PK, AUTOINCREMENT | 主键 |
| name | TEXT | NOT NULL | 文件夹名 |
| is_deleted | INTEGER | NOT NULL DEFAULT 0 | 软删除标记 |
| created_at | TEXT | NOT NULL DEFAULT (now) | 创建时间 |
| updated_at | TEXT | NOT NULL DEFAULT (now) | 更新时间 |

```sql
CREATE TABLE folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

索引：

```sql
CREATE INDEX idx_folders_active ON folders(is_deleted);
```

---

## 7. `wechat_messages` — 微信 Bot 消息历史

| 字段 | 类型 | 约束/默认 | 注释 |
|------|------|-----------|------|
| id | INTEGER | PK, AUTOINCREMENT | 主键 |
| user_id | TEXT | NOT NULL | 微信用户 ID |
| role | TEXT | NOT NULL CHECK | 角色：`user` / `assistant` |
| content | TEXT | NOT NULL | 消息内容 |
| created_at | TEXT | NOT NULL DEFAULT (now) | 创建时间 |

> 每用户最多保留最近 100 条（`addMessageToHistory` 超出即清理）。主动消息也写入该表（user 触发指令 + assistant 主动问候）。

```sql
CREATE TABLE wechat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

索引：

```sql
CREATE INDEX idx_wechat_messages_user ON wechat_messages(user_id, created_at);
```

---

## 8. `todo_progress_logs` — 长期待办进度日志

| 字段 | 类型 | 约束/默认 | 注释 |
|------|------|-----------|------|
| id | INTEGER | PK, AUTOINCREMENT | 主键 |
| todo_id | INTEGER | NOT NULL, FK → todos.id, ON DELETE CASCADE | 所属待办 |
| content | TEXT | NOT NULL | 进度更新内容 |
| created_at | TEXT | NOT NULL DEFAULT (now) | 创建时间 |

```sql
CREATE TABLE todo_progress_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

索引：

```sql
CREATE INDEX idx_todo_progress_logs_todo_id_created_at
ON todo_progress_logs(todo_id, created_at DESC);
```

---

## 9. `tools` — Agent 工具

| 字段 | 类型 | 约束/默认 | 注释 |
|------|------|-----------|------|
| id | INTEGER | PK, AUTOINCREMENT | 主键 |
| name | TEXT | NOT NULL | 工具名（对应内置 execute 函数名） |
| label | TEXT | NOT NULL DEFAULT '' | 显示名 |
| description | TEXT | NOT NULL DEFAULT '' | 工具描述（给 LLM 看） |
| instruction | TEXT | NOT NULL DEFAULT '' | 追加说明，非空时覆盖/追加到 description |
| enabled | INTEGER | NOT NULL DEFAULT 0 | 是否启用（仅启用的工具会被 loadToolsFromDb 加载） |
| created_at | TEXT | NOT NULL DEFAULT (now) | 创建时间 |
| updated_at | TEXT | NOT NULL DEFAULT (now) | 更新时间 |
| category_id | INTEGER | FK → tool_categories.id | 所属工具分类（迁移 021） |

> 内置 13 个工具在迁移 020 刷入：list_notes、search_note_lines、get_note_lines、list_folders、get_todo、create_todo、update_todo、delete_todo、update_todo_progress、get_todo_progress_logs、search_knowledge_base、get_formatted_todos、get_current_time。

```sql
CREATE TABLE tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  instruction TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  category_id INTEGER REFERENCES tool_categories(id)
);
```

---

## 10. `skills` — Agent 技能

| 字段 | 类型 | 约束/默认 | 注释 |
|------|------|-----------|------|
| id | INTEGER | PK, AUTOINCREMENT | 主键 |
| name | TEXT | NOT NULL | 技能名 |
| path | TEXT | NOT NULL DEFAULT '' | 技能文件路径 |
| enabled | INTEGER | NOT NULL DEFAULT 0 | 是否启用（启用的技能拼入 prompt 后缀） |
| created_at | TEXT | NOT NULL DEFAULT (now) | 创建时间 |
| updated_at | TEXT | NOT NULL DEFAULT (now) | 更新时间 |
| category_id | INTEGER | FK → skills_categories.id | 所属技能分类（迁移 021） |

```sql
CREATE TABLE skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  category_id INTEGER REFERENCES skills_categories(id)
);
```

---

## 11. `tool_categories` — 工具分类

| 字段 | 类型 | 约束/默认 | 注释 |
|------|------|-----------|------|
| id | INTEGER | PK, AUTOINCREMENT | 主键 |
| name | TEXT | NOT NULL | 分类名 |
| description | TEXT | NOT NULL DEFAULT '' | 分类描述 |
| created_at | TEXT | NOT NULL DEFAULT (now) | 创建时间 |
| updated_at | TEXT | NOT NULL DEFAULT (now) | 更新时间 |

```sql
CREATE TABLE tool_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

---

## 12. `skills_categories` — 技能分类

| 字段 | 类型 | 约束/默认 | 注释 |
|------|------|-----------|------|
| id | INTEGER | PK, AUTOINCREMENT | 主键 |
| name | TEXT | NOT NULL | 分类名 |
| description | TEXT | NOT NULL DEFAULT '' | 分类描述 |
| created_at | TEXT | NOT NULL DEFAULT (now) | 创建时间 |
| updated_at | TEXT | NOT NULL DEFAULT (now) | 更新时间 |

```sql
CREATE TABLE skills_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

---

## 13. `embedding_tasks` — ⚠️ 遗留表

存在于实际数据库，但当前代码**未读写**，属早期知识库异步任务设计的遗留。

```sql
CREATE TABLE embedding_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL CHECK (source_type IN ('note', 'conversation')),
  source_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(source_type, source_id)
);
```

索引：

```sql
CREATE INDEX idx_embedding_tasks_status ON embedding_tasks(status);
CREATE INDEX idx_embedding_tasks_source ON embedding_tasks(source_type, source_id);
```

---

## 14. `_migrations` — 迁移跟踪表

记录已执行的迁移文件，保证 `runMigrations()` 幂等。

| 字段 | 类型 | 约束/默认 | 注释 |
|------|------|-----------|------|
| id | INTEGER | PK, AUTOINCREMENT | 主键 |
| filename | TEXT | NOT NULL, UNIQUE | 迁移文件名 |
| executed_at | TEXT | NOT NULL DEFAULT (now) | 执行时间 |

```sql
CREATE TABLE _migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  executed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

---

## 15. `_notes_old_20260419*` — ⚠️ 遗留备份表

2026-04-19 重建 `notes` 表（补 `is_knowledge_base` 列）时 SQLite 自动生成的旧表备份，共 3 张（`_notes_old_20260419`、`_notes_old_20260419_1`、`_notes_old_20260419_2`），结构与旧版 notes 一致。当前代码不读写，可安全清理。

---

## 16. `wechat_reports` — 微信日报/周报/月报

| 字段 | 类型 | 约束/默认 | 注释 |
|------|------|-----------|------|
| id | INTEGER | PK, AUTOINCREMENT | 主键 |
| user_id | TEXT | NOT NULL | 微信用户 ID |
| report_type | TEXT | NOT NULL, CHECK | 报告类型：`daily`（日报）/ `weekly`（周报）/ `monthly`（月报） |
| period_start | TEXT | NOT NULL | 覆盖周期开始（UTC ISO8601） |
| period_end | TEXT | NOT NULL | 覆盖周期结束 |
| content | TEXT | NOT NULL | 报告 Markdown 全文 |
| created_at | TEXT | NOT NULL DEFAULT (now) | 生成时间 |

> 微信 Bot 定时/命令生成的日报、周报、月报存储表（迁移 023）。定时触发无防重发守卫，靠 `UNIQUE(user_id, report_type, period_start)` 兜底防重复入库；`period_start` 唯一即可区分同一用户同类型的不同周期。

```sql
CREATE TABLE wechat_reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT    NOT NULL,
  report_type  TEXT    NOT NULL CHECK(report_type IN ('daily','weekly','monthly')),
  period_start TEXT    NOT NULL,
  period_end   TEXT    NOT NULL,
  content      TEXT    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, report_type, period_start)
);
```

索引：

```sql
CREATE INDEX idx_wechat_reports_user_type
ON wechat_reports(user_id, report_type, period_start);
```

---

## 补充说明

- **时间格式**：所有 `created_at` / `updated_at` 均为 ISO8601 文本（`strftime('%Y-%m-%dT%H:%M:%fZ','now')`，UTC），前端展示时自行转本地时区。
- **布尔/软删除**：一律用 `INTEGER` 0/1 表示；软删除字段（`is_deleted`、`is_archived`、`is_pinned` 等）不物理删除行。
- **JSON 列**：`tags`、`kb_citations`、`tool_calls`、`settings.value` 存 JSON 字符串，读取时 `JSON.parse`。
- **孤儿列/表**：`todos.is_knowledge_base`、`conversations.kb_scope`、`conversations.test_kb`、`embedding_tasks` 表、`_notes_old_*` 表均无当前代码引用，属历史遗留。
- **迁移编号**：018 被有意跳过（017 → 019），勿补号（见 CLAUDE.md）。
- **向量数据不在 SQLite**：知识库 embedding 存在 Qdrant（REST :6333），由 `docker-compose.yml` 启动，数据落盘 `./qdrant_storage/`，与本文档的表结构无关。
