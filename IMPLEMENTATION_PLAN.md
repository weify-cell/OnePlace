# OnePlace 个人助手系统 - 实施计划

## Context

用户需要从零构建一个个人助手 Web 系统，包含三个核心模块：待办事项管理、笔记记录、大模型对话。目标是单用户本地使用，**需要密码保护防止隐私泄露**，未来可能扩展 Android 端。

---

## 技术选型

| 层次 | 技术 | 理由 |
|------|------|------|
| 前端框架 | Vue 3 + TypeScript + Vite | 用户选择 |
| 状态管理 | Pinia 3 | Vue 3 官方推荐 |
| 路由 | Vue Router 4 | Vue 3 标准 |
| UI 组件库 | Naive UI ^2.41.0 | 纯 Vue 3 + TS 设计，内置暗色模式，风格简洁 |
| CSS 引擎 | UnoCSS + preset-wind | Tailwind 兼容，与 Vite 原生集成 |
| 富文本 | Tiptap v3 | Headless 架构，存储 JSON，支持 TaskList/代码高亮 |
| HTTP 客户端 | axios | 标准选择 |
| 后端框架 | Express + TypeScript | 轻量灵活 |
| 数据库 | SQLite (better-sqlite3) | 本地单用户，同步 API 简洁 |
| AI 客户端 | openai SDK ^4.x | 兼容所有 OpenAI 协议厂商（通义/Kimi/智谱） |
| AI 流式 | SSE (Server-Sent Events) | 单向流，HTTP/1.1 原生支持，Android 友好 |
| 认证方式 | 简单密码保护 + JWT | 单密码（无用户名），bcrypt 哈希存储，JWT 会话 token |

---

## 项目结构

```
OnePlace/
├── src/                        # Vue 3 前端
│   ├── views/
│   │   ├── LoginView.vue         # 登录页（已有密码时）
│   │   ├── SetupView.vue         # 首次设置密码页
│   │   ├── TodosView.vue
│   │   ├── NotesView.vue
│   │   ├── NoteDetailView.vue
│   │   ├── ChatView.vue
│   │   └── SettingsView.vue
│   ├── components/
│   │   ├── common/             # AppLayout, AppSidebar, EmptyState, TagInput
│   │   ├── todos/              # TodoList, TodoItem, TodoCreateModal, TodoFilters
│   │   ├── notes/              # NoteList, NoteCard, TiptapEditor, TiptapToolbar, NoteFilters
│   │   └── chat/               # ConversationList, MessageList, MessageBubble, MessageInput, ModelSelector
│   ├── composables/            # useTodos, useNotes, useChat, useSSEStream
│   ├── stores/                 # auth.store, todo.store, note.store, chat.store, settings.store
│   ├── api/
│   │   ├── auth.api.ts
│   │   ├── todos.api.ts
│   │   ├── notes.api.ts
│   │   ├── chat.api.ts
│   │   └── settings.api.ts
│   ├── router/index.ts
│   ├── types/
│   └── utils/
├── server/
│   ├── middleware/auth.middleware.ts
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   │   └── ai/
│   ├── database/
│   │   ├── index.ts
│   │   ├── migrate.ts
│   │   └── migrations/
│   └── index.ts
├── data/oneplace.db
├── package.json
├── vite.config.ts
└── uno.config.ts
```

---

## 分阶段实施计划

### ✅ 阶段一：脚手架 + 认证基础 + 基础结构
**目标**：项目可运行，密码保护生效，健康检查通过

- [ ] 初始化 Vue 3 + Vite + TypeScript 项目（package.json, vite.config.ts, tsconfig.json）
- [ ] 安装前端依赖（Vue Router、Pinia、Naive UI、UnoCSS、axios）
- [ ] 初始化后端 Express + TypeScript（server/ 目录）
- [ ] 安装后端依赖（express、better-sqlite3、openai、zod、cors、dotenv、jsonwebtoken、bcryptjs）
- [ ] 数据库迁移执行器 + SQL 文件
- [ ] auth.service.ts - 密码哈希、JWT 签发验证
- [ ] auth.middleware.ts - JWT 验证中间件
- [ ] auth.routes.ts - /api/auth/setup、/api/auth/login、/api/auth/check
- [ ] GET /api/health
- [ ] Vite 代理 /api → :3000
- [ ] auth.store.ts - token 管理
- [ ] LoginView.vue 和 SetupView.vue
- [ ] router/index.ts - 路由守卫
- [ ] AppLayout + AppSidebar 布局
- [ ] UnoCSS + Naive UI 配置

**验收**：
- 首次访问 / → /setup → 设置密码 → 进入应用
- 后续访问 / → /login → 输入密码 → 进入应用
- /api/todos 无 token 返回 401
- GET /api/health 无需认证返回 OK

### ⏳ 阶段二：待办事项模块
- [ ] 后端 todo.service.ts + todos.controller.ts + 路由
- [ ] 前端 types, todos.api.ts, todo.store.ts
- [ ] TodosView + TodoList + TodoItem
- [ ] TodoCreateModal
- [ ] TodoFilters
- [ ] TagInput 通用组件

### ⏳ 阶段三：笔记模块
- [ ] 后端 note.service.ts + 路由
- [ ] 前端 notes.api.ts, note.store.ts
- [ ] TiptapEditor.vue + TiptapToolbar.vue
- [ ] NotesView + NoteCard
- [ ] NoteDetailView（防抖自动保存）
- [ ] 置顶/归档操作

### ⏳ 阶段四：AI 对话模块
- [ ] 后端 ai/providers.ts + ai/openai-client.ts
- [ ] 后端 chat.service.ts (SSE)
- [ ] 前端 useSSEStream.ts
- [ ] 前端 chat.store.ts
- [ ] ChatView + ConversationList + MessageList + MessageBubble + MessageInput
- [ ] SettingsView (API Key 配置)
- [ ] ModelSelector

### ⏳ 阶段五：UI 打磨 + 集成测试
- [ ] 全局错误处理
- [ ] 加载状态（骨架屏）
- [ ] 空状态组件
- [ ] 暗色模式
- [ ] 键盘快捷键
- [ ] 响应式侧边栏
- [ ] 单元测试

---

## 数据库 Schema

```sql
-- todos 表
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
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- notes 表
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
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- conversations 表
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '新对话',
  model TEXT NOT NULL DEFAULT 'qwen-turbo',
  provider TEXT NOT NULL DEFAULT 'qwen',
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- messages 表
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
  content TEXT NOT NULL DEFAULT '',
  tokens_used INTEGER DEFAULT NULL,
  is_error INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- settings 表
CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

---

## API 端点

### Auth
```
POST /api/auth/check    # { needsSetup: boolean }
POST /api/auth/setup    # { password } → { token }
POST /api/auth/login    # { password } → { token }
```

### Todos
```
GET/POST   /api/todos
GET/PATCH/DELETE /api/todos/:id
GET        /api/todos/tags
```

### Notes
```
GET/POST   /api/notes
GET/PATCH/DELETE /api/notes/:id
PATCH      /api/notes/:id/pin
PATCH      /api/notes/:id/archive
GET        /api/notes/tags
```

### Conversations & Chat
```
GET/POST   /api/conversations
GET/PATCH/DELETE /api/conversations/:id
GET        /api/conversations/:id/messages
POST       /api/conversations/:id/chat    [SSE]
DELETE     /api/conversations/:id/messages
```

### Settings
```
GET        /api/settings
GET/PUT    /api/settings/:key
GET        /api/health
```

---

## 关键技术决策

1. **DB_PATH 在函数内计算**：避免环境变量加载前初始化
2. **SSE 使用 fetch 而非 EventSource**：支持 POST + AbortController
3. **Pinia store 不持久化业务数据**：仅 auth token 用 localStorage
4. **标签存 JSON 字符串**：简单，SQLite json_each 可聚合
5. **bcryptjs + JWT 30天有效期**：单用户简单密码保护
