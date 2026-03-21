# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 当前迭代
- 迭代目标：（待规划）
- 版本号：v1.2
- 模块名：（待定）
- 启动日期：（待定）

## 阶段完成状态
- [ ] 需求分析    → .claude/handoff/pm-output.md
- [ ] 架构设计    → .claude/handoff/architect-output.md
- [ ] 后端开发    → .claude/handoff/backend-output.md
- [ ] 前端开发    → .claude/handoff/frontend-output.md
- [ ] 测试验收    → .claude/handoff/tester-output.md

## 长期记忆
- 已知问题：.claude/memory/known-issues.md

## 会话规范
- 启动时读取：CLAUDE.md → memory/conventions.md → memory/decisions.md → 上游 handoff
- 完成时写入：更新阶段状态 + 写 handoff + 沉淀 memory
- 代码写入文件，不粘贴到对话
- 对话输出不超过 150 字

## 归档索引
详见 .claude/archive/index.md

---

## 开发命令

### 同时启动前后端（推荐）
```bash
npm run dev:all          # 前端（端口 5173）+ 后端（端口 3000）并发启动
```

### 单独启动
```bash
npm run dev              # 仅启动 Vite 前端
npm run server           # 仅启动 Express 后端（cd server && npm run dev）
```

### 类型检查与构建
```bash
npm run typecheck        # 前端 vue-tsc 检查
npm run build            # vue-tsc + vite build → dist/

cd server
npm run typecheck        # 后端 tsc 检查
npm run build            # 编译到 server/dist/
```

### 测试
```bash
npm test                 # vitest（前端单元测试）
```

### 首次初始化
```bash
npm run install:all      # 同时安装根目录和 server/ 的依赖
```

## 架构概览

### 单仓库结构
项目包含两个独立的 package.json：
- 根目录 `package.json` → Vue 3 前端（Vite 开发服务器，端口 5173）
- `server/package.json` → Express 后端（端口 3000）
- 开发时 Vite 将 `/api/*` 代理到 `:3000`；生产环境由 Express 直接 serve `dist/`

### 后端（`server/src/`）
标准分层架构：`routes → controllers → services → database`

**数据库**：better-sqlite3 单例（`database/index.ts`）。`connectDatabase()` 函数**必须**在函数体内懒加载计算 `DB_PATH`，不能在模块顶层计算——因为 dotenv 在模块初始化之后才完成加载。`DB_PATH` 通过 `__dirname` 相对项目根目录解析，不使用 `process.cwd()`。

**数据库迁移**：`database/migrations/` 下的 SQL 文件按文件名顺序在服务器启动时执行，已执行记录保存在 `_migrations` 表中防止重复运行。新迁移文件命名格式：`00N_描述.sql`。

**认证**：单密码保护（无用户名概念）。密码以 bcrypt 哈希存储在 `settings` 表的 `password_hash` 键下。空字符串 `""` 表示尚未设置密码（触发首次设置流程）。JWT token 有效期 30 天，前端存储在 `localStorage`。除 `/api/health` 和 `/api/auth/*` 外，所有 `/api/*` 路由均受 `auth.middleware.ts` 保护。

**设置项**：`settings` 表为键值对存储，值为 JSON 序列化字符串。`getAllSettings()` 批量读取时排除 `password_hash`。AI 提供商的 API Key 以 JSON 对象形式存储在 `ai_providers` 键下。

**SSE 流式输出**（`services/chat.service.ts`）：对话流式推送格式为 `event: start`、`event: delta`、`event: done`、`event: error`。流式开始前先插入空内容的 assistant 消息行，流结束后更新为完整内容。

### 前端（`src/`）

**自动导入**：`unplugin-auto-import` 自动导入 Vue 组合式 API（`ref`、`computed`、`watch`、`onMounted` 等）、Vue Router、Pinia 和 Naive UI 工具函数（`useMessage`、`useDialog` 等）——无需手动 import。`unplugin-vue-components` 自动导入所有 Naive UI 组件（`NButton`、`NInput` 等）。

**Pinia Store**（组合式 API 风格）：
- `auth.store` — token 持久化在 `localStorage` 的 `oneplace_token` 键；每次路由跳转都会调用 `checkSetup()`
- `todo.store` — 维护当前筛选条件和分页状态；修改筛选后需调用 `fetchTodos()`
- `note.store` — `currentNote` 保存编辑器所需的完整内容；列表数据不包含 content 字段
- `chat.store` — `streamingMessage` 累积 SSE delta 片段；`isStreaming` 控制发送按钮禁用状态
- `settings.store` — 应用启动时加载一次；AI 提供商配置嵌套在 `aiProviders` 下

**SSE 解析**（`chat.store` 的 `sendMessage`）：使用 `fetch` + `ReadableStream`（而非 `EventSource`）以支持 POST 请求体和 `AbortController` 取消。按 `\n\n` 分割数据块，从每块中提取 `event:` 和 `data:` 行进行解析。

**笔记自动保存**：`NoteDetailView` 使用 `@vueuse/core` 的 `useDebounceFn`（1000ms 防抖）调用 `noteStore.updateNote()`，无需手动保存按钮。

**Tiptap 富文本**：内容以 Tiptap JSON 格式（stringify 后）存储。`TiptapEditor` 挂载时解析 JSON；每次变更时 emit stringify 后的 JSON。后端 `notes.service.ts` 将内容提取为纯文本写入 `content_text` 列用于全文搜索。

### 环境变量（项目根目录 `.env`）
```
PORT=3000
DB_PATH=./data/oneplace.db    # 相对于项目根目录
JWT_SECRET=...                 # 部署前务必修改
JWT_EXPIRES_IN=30d
```

后端通过显式路径加载 `.env`：`resolve(__dirname, '../../.env')`（从 `server/src/` 向上两级）。

## 关键约束

- **标签**以 JSON 数组存储在 `TEXT` 列（如 `'["工作","紧急"]'`）。标签筛选和聚合查询使用 SQLite 的 `json_each()` 函数。
- **软删除**：todos、notes、conversations 使用 `is_deleted = 1` 标记删除而非物理删除。所有查询必须包含 `WHERE is_deleted = 0`。
- **无 ORM**：所有 SQL 通过 better-sqlite3 Prepared Statements 直接编写，同步 API 是有意为之。
- **新增 AI 提供商**：在 `server/src/services/ai/providers.ts` 的 `AI_PROVIDERS` 中添加配置，设置页面会自动渲染对应的 API Key 输入区域。
- **新增数据库迁移**：创建 `server/src/database/migrations/00N_名称.sql`，下次服务器启动时自动执行。

## 禁止读取的目录
node_modules/, dist/, .git/, coverage/, *.log, .cache/