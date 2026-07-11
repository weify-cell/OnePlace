# 工具广场与技能管理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为工具和技能提供可视化管理——新建、编辑、启停、删除——DB 为唯一配置源，运行时按 DB 加载注入 Agent 和 system prompt

**Architecture:** 新建两张表 `tools`/`skills`，builtin-tools.ts 改为导出代码参考 `Map`，AgentPool 启动时从 DB 加载组装工具和 skills。前端两个独立 Vue 页面（表格 + 弹窗编辑 + CodeMirror）

**Tech Stack:** TypeScript, Vue 3, Naive UI, CodeMirror 6, better-sqlite3, Express

## 全局约束

- DB schema：新增 `tools`、`skills` 两表，不修改旧表
- pi-ai 0.80.6 / pi-agent-core 0.80.6
- formatSkillsForSystemPrompt 从 `@earendil-works/pi-agent-core` 导入
- AgentTool 类型从 `@earendil-works/pi-agent-core` 导入
- 类型检查：`cd server && npx tsc --noEmit` 零错误
- 前端类型检查：`npx vue-tsc --noEmit` 零错误
- Skills 文件目录：`server/data/skills/`（项目根目录相对路径）

---

### Task 1: 数据库迁移

**Files:**
- Create: `server/src/database/migrations/019_tools_skills.sql`

- [ ] **Step 1: 写入迁移 SQL**

```sql
CREATE TABLE IF NOT EXISTS tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  instruction TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 技能文件存储目录
-- 文件路径：server/data/skills/{path}

SELECT '019_tools_skills done' as status;
```

- [ ] **Step 2: 创建 skills 目录**

```bash
mkdir -p server/data/skills
```

- [ ] **Step 3: 类型检查**

```bash
cd server && npx tsc --noEmit
```

- [ ] **Step 4: 提交**

```bash
git add server/src/database/migrations/019_tools_skills.sql
git commit -m "feat: 新建 tools/skills 表迁移"
```

---

### Task 2: builtin-tools.ts 改为导出 Map

**Files:**
- Modify: `server/src/services/ai/builtin-tools.ts`

- [ ] **Step 1: 将 `getBuiltinTools(): AgentTool[]` 改为 `getBuiltinToolMap(): Map<string, AgentTool>`**

```typescript
import { Type } from '@earendil-works/pi-ai'
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { getNotes, searchNoteLines, getNoteLines } from '../notes.service.js'
import { getTodos, getTodoById, createTodo, updateTodo, updateTodoProgress, getTodoProgressLogs, deleteTodo } from '../todos.service.js'
import { getFolders } from '../folders.service.js'
import { searchKnowledgeBase } from '../knowledge-base.service.js'

function textResult(text: string): AgentToolResult<undefined> {
  return { content: [{ type: 'text' as const, text }], details: undefined }
}

export function getBuiltinToolMap(): Map<string, AgentTool> {
  const tools: AgentTool[] = [
    {
      name: 'list_notes', label: '列出笔记',
      description: '列出笔记列表，可按文件夹筛选。用于了解用户的笔记概况。',
      parameters: Type.Object({
        search: Type.Optional(Type.String()),
        tag: Type.Optional(Type.String()),
        folder_id: Type.Optional(Type.Number()),
        page: Type.Optional(Type.Number({ default: 1 })),
        pageSize: Type.Optional(Type.Number({ default: 20 })),
      }),
      execute: async (_toolCallId, params) => {
        const { items } = getNotes({ search: params.search, tag: params.tag, folder_id: params.folder_id, page: params.page ?? 1, pageSize: params.pageSize ?? 20 })
        return textResult(items.map(n => `[${n.id}] ${n.title}`).join('\n') || '没有找到匹配的笔记')
      },
    },
    // ...其余 12 个工具（保持现有 execute 逻辑不变）
  ]
  return new Map(tools.map(t => [t.name, t]))
}
```

**注意**：其余 12 个工具保持不变，只改外层包装——`AgentTool[]` → `new Map(tools.map(t => [t.name, t]))`。

- [ ] **Step 2: 更新 AgentPool 和调用方**

`AgentPool` 的 `tools` 参数类型不变（仍为 `AgentTool[]`），调用方从 `getBuiltinToolMap()` 取值后转为数组传入。

同时保留 `getBuiltinTools()` 作为兼容别名，内部调用 `getBuiltinToolMap()` ：

```typescript
export function getBuiltinTools(): AgentTool[] {
  return Array.from(getBuiltinToolMap().values())
}
```

- [ ] **Step 3: 类型检查**

```bash
cd server && npx tsc --noEmit
```

- [ ] **Step 4: 提交**

```bash
git add server/src/services/ai/builtin-tools.ts
git commit -m "refactor: builtin-tools 导出 Map<name, AgentTool>"
```

---

### Task 3: tool-config 后端（CRUD 服务 + 路由）

**Files:**
- Create: `server/src/services/tool-config.service.ts`
- Create: `server/src/controllers/tool-config.controller.ts`
- Create: `server/src/routes/tool-config.routes.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: 写入 service**

```typescript
import { connectDatabase } from '../database/index.js'

export interface ToolConfig {
  id: number
  name: string
  label: string
  description: string
  instruction: string
  enabled: number
  created_at: string
  updated_at: string
}

function rowToConfig(row: Record<string, unknown>): ToolConfig {
  return {
    id: row.id as number, name: row.name as string, label: row.label as string,
    description: row.description as string, instruction: row.instruction as string,
    enabled: row.enabled as number, created_at: row.created_at as string, updated_at: row.updated_at as string,
  }
}

export function listTools(): ToolConfig[] {
  const db = connectDatabase()
  return (db.prepare('SELECT * FROM tools ORDER BY id ASC').all() as Record<string, unknown>[]).map(rowToConfig)
}

export function createTool(data: Partial<ToolConfig>): ToolConfig {
  const db = connectDatabase()
  const result = db.prepare(
    'INSERT INTO tools (name, label, description, instruction, enabled) VALUES (?, ?, ?, ?, ?)'
  ).run(data.name || '', data.label || '', data.description || '', data.instruction || '', data.enabled ?? 0)
  return db.prepare('SELECT * FROM tools WHERE id = ?').get(result.lastInsertRowid) as unknown as ToolConfig
}

export function updateTool(id: number, data: Partial<ToolConfig>): ToolConfig | null {
  const db = connectDatabase()
  const existing = db.prepare('SELECT * FROM tools WHERE id = ?').get(id)
  if (!existing) return null
  db.prepare(
    `UPDATE tools SET name=?, label=?, description=?, instruction=?, enabled=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`
  ).run(data.name, data.label, data.description, data.instruction, data.enabled, id)
  return db.prepare('SELECT * FROM tools WHERE id = ?').get(id) as unknown as ToolConfig
}

export function deleteTool(id: number): boolean {
  const db = connectDatabase()
  return db.prepare('DELETE FROM tools WHERE id = ?').run(id).changes > 0
}
```

- [ ] **Step 2: 写入 controller**

```typescript
import { Request, Response } from 'express'
import * as service from '../services/tool-config.service.js'

export function list(req: Request, res: Response): void {
  res.json(service.listTools())
}
export function create(req: Request, res: Response): void {
  res.status(201).json(service.createTool(req.body))
}
export function update(req: Request, res: Response): void {
  const id = Number(req.params.id)
  const result = service.updateTool(id, req.body)
  if (!result) { res.status(404).json({ error: 'Not found' }); return }
  res.json(result)
}
export function remove(req: Request, res: Response): void {
  const id = Number(req.params.id)
  const ok = service.deleteTool(id)
  if (!ok) { res.status(404).json({ error: 'Not found' }); return }
  res.status(204).end()
}
```

- [ ] **Step 3: 写入路由**

```typescript
import { Router } from 'express'
import * as ctrl from '../controllers/tool-config.controller.js'

export const toolConfigRouter = Router()
toolConfigRouter.get('/list', ctrl.list)
toolConfigRouter.post('/', ctrl.create)
toolConfigRouter.put('/:id', ctrl.update)
toolConfigRouter.delete('/:id', ctrl.remove)
```

- [ ] **Step 4: 在 index.ts 中注册路由**

```typescript
import { toolConfigRouter } from './routes/tool-config.routes.js'
// ...
app.use('/api/tool-config', toolConfigRouter)
```

- [ ] **Step 5: 类型检查**

```bash
cd server && npx tsc --noEmit
```

- [ ] **Step 6: 提交**

```bash
git add server/src/services/tool-config.service.ts server/src/controllers/tool-config.controller.ts server/src/routes/tool-config.routes.ts server/src/index.ts
git commit -m "feat: tool-config CRUD API"
```

---

### Task 4: skill-config 后端（CRUD 服务 + 路由）

**Files:**
- Create: `server/src/services/skill-config.service.ts`
- Create: `server/src/controllers/skill-config.controller.ts`
- Create: `server/src/routes/skill-config.routes.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: 写入 service**

```typescript
import { connectDatabase } from '../database/index.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILLS_DIR = path.resolve(__dirname, '../../data/skills')

export interface SkillConfig {
  id: number
  name: string
  path: string
  enabled: number
  created_at: string
  updated_at: string
}

function rowToConfig(row: Record<string, unknown>): SkillConfig {
  return {
    id: row.id as number, name: row.name as string, path: row.path as string,
    enabled: row.enabled as number, created_at: row.created_at as string, updated_at: row.updated_at as string,
  }
}

export function listSkills(): SkillConfig[] {
  const db = connectDatabase()
  return (db.prepare('SELECT * FROM skills ORDER BY id ASC').all() as Record<string, unknown>[]).map(rowToConfig)
}

export function createSkill(data: Partial<SkillConfig>): SkillConfig {
  const db = connectDatabase()
  const result = db.prepare(
    'INSERT INTO skills (name, path, enabled) VALUES (?, ?, ?)'
  ).run(data.name || '', data.path || '', data.enabled ?? 0)
  return db.prepare('SELECT * FROM skills WHERE id = ?').get(result.lastInsertRowid) as unknown as SkillConfig
}

export function updateSkill(id: number, data: Partial<SkillConfig>): SkillConfig | null {
  const db = connectDatabase()
  const existing = db.prepare('SELECT * FROM skills WHERE id = ?').get(id)
  if (!existing) return null
  db.prepare(
    `UPDATE skills SET name=?, path=?, enabled=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`
  ).run(data.name, data.path, data.enabled, id)
  return db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as unknown as SkillConfig
}

export function deleteSkill(id: number): boolean {
  const db = connectDatabase()
  const row = db.prepare('SELECT path FROM skills WHERE id = ?').get(id) as SkillConfig | undefined
  if (!row) return false
  // 删除文件
  const filePath = path.resolve(SKILLS_DIR, row.path)
  fs.unlink(filePath).catch(() => {})
  return db.prepare('DELETE FROM skills WHERE id = ?').run(id).changes > 0
}

export async function readSkillFile(id: number): Promise<string | null> {
  const db = connectDatabase()
  const row = db.prepare('SELECT path FROM skills WHERE id = ?').get(id) as SkillConfig | undefined
  if (!row) return null
  const filePath = path.resolve(SKILLS_DIR, row.path)
  try { return await fs.readFile(filePath, 'utf-8') }
  catch { return null }
}

export async function writeSkillFile(id: number, content: string): Promise<boolean> {
  const db = connectDatabase()
  const row = db.prepare('SELECT path FROM skills WHERE id = ?').get(id) as SkillConfig | undefined
  if (!row) return false
  const filePath = path.resolve(SKILLS_DIR, row.path)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
  return true
}

export interface EnabledSkill {
  name: string
  path: string
  content: string
}

export async function getEnabledSkills(): Promise<EnabledSkill[]> {
  const db = connectDatabase()
  const rows = db.prepare('SELECT name, path FROM skills WHERE enabled = 1').all() as { name: string; path: string }[]
  const result: EnabledSkill[] = []
  for (const row of rows) {
    const filePath = path.resolve(SKILLS_DIR, row.path)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      result.push({ name: row.name, path: row.path, content })
    } catch { /* skip unreadable files */ }
  }
  return result
}
```

- [ ] **Step 2: 写入 controller**

```typescript
import { Request, Response } from 'express'
import * as service from '../services/skill-config.service.js'

export function list(req: Request, res: Response): void {
  res.json(service.listSkills())
}
export function create(req: Request, res: Response): void {
  res.status(201).json(service.createSkill(req.body))
}
export function update(req: Request, res: Response): void {
  const id = Number(req.params.id)
  const result = service.updateSkill(id, req.body)
  if (!result) { res.status(404).json({ error: 'Not found' }); return }
  res.json(result)
}
export function remove(req: Request, res: Response): void {
  const id = Number(req.params.id)
  const ok = service.deleteSkill(id)
  if (!ok) { res.status(404).json({ error: 'Not found' }); return }
  res.status(204).end()
}
export async function getFile(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id)
  const content = await service.readSkillFile(id)
  if (content === null) { res.status(404).json({ error: 'Not found' }); return }
  res.json({ content })
}
export async function putFile(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id)
  const ok = await service.writeSkillFile(id, req.body.content || '')
  if (!ok) { res.status(404).json({ error: 'Not found' }); return }
  res.json({ success: true })
}
export async function getEnabled(req: Request, res: Response): Promise<void> {
  const skills = await service.getEnabledSkills()
  res.json(skills)
}
```

- [ ] **Step 3: 写入路由**

```typescript
import { Router } from 'express'
import * as ctrl from '../controllers/skill-config.controller.js'

export const skillConfigRouter = Router()
skillConfigRouter.get('/enabled', ctrl.getEnabled)
skillConfigRouter.get('/list', ctrl.list)
skillConfigRouter.get('/:id/file', ctrl.getFile)
skillConfigRouter.put('/:id/file', ctrl.putFile)
skillConfigRouter.post('/', ctrl.create)
skillConfigRouter.put('/:id', ctrl.update)
skillConfigRouter.delete('/:id', ctrl.remove)
```

> 注意：`/enabled` 必须在 `/:id` 之前，避免 `enabled` 被当成 id 解析。

- [ ] **Step 4: index.ts 注册路由**

```typescript
import { skillConfigRouter } from './routes/skill-config.routes.js'
// ...
app.use('/api/skill-config', skillConfigRouter)
```

- [ ] **Step 5: 类型检查**

```bash
cd server && npx tsc --noEmit
```

- [ ] **Step 6: 提交**

```bash
git add server/src/services/skill-config.service.ts server/src/controllers/skill-config.controller.ts server/src/routes/skill-config.routes.ts server/src/index.ts
git commit -m "feat: skill-config CRUD API + 文件读写"
```

---

### Task 5: AgentPool 接入工具和 skills 加载

**Files:**
- Modify: `server/src/services/ai/agent-pool.ts`
- Modify: `server/src/services/wechat/ilink-bot.service.ts`
- Modify: `server/src/services/chat.service.ts`

- [ ] **Step 1: 修改 AgentPool —— 从 DB 加载工具和 skills**

在 `agent-pool.ts` 中新增 `loadToolsFromDb` 和 `loadSkillsFromDb` 函数，`AgentPool` 实例化时调用。

```typescript
import { listTools } from '../tool-config.service.js'
import { getEnabledSkills } from '../skill-config.service.js'
import { getBuiltinToolMap } from './builtin-tools.js'
import { formatSkillsForSystemPrompt } from '@earendil-works/pi-agent-core'

function loadToolsFromDb(): AgentTool[] {
  const builtinMap = getBuiltinToolMap()
  const dbTools = listTools().filter(t => t.enabled)
  const result: AgentTool[] = []
  const seen = new Set<string>()

  for (const dbTool of dbTools) {
    const builtin = builtinMap.get(dbTool.name)
    if (builtin) {
      // 内置工具：代码 provide execute，DB 提供 description/instruction
      const description = dbTool.description || builtin.description
      const instruction = dbTool.instruction || ''
      const mergedDescription = instruction
        ? `${description}\n\n${instruction}`
        : description
      result.push({ ...builtin, description: mergedDescription })
      seen.add(dbTool.name)
    } else {
      // 纯文本工具：无 execute，通过 prompt 注入
      // 在 result 中不加入（无 execute 无法被 Agent 调用）
      // 纯文本部分在 loadSkillsFromDb 中处理
    }
  }

  // 日志：重复 name 警告
  const names = dbTools.map(t => t.name)
  const dupes = names.filter((n, i) => names.indexOf(n) !== i)
  if (dupes.length > 0) {
    console.warn(`[agent-pool] duplicate tool names: ${dupes.join(', ')}`)
  }

  return result
}

export async function loadSkillPrompt(): Promise<string> {
  const skills = await getEnabledSkills()
  if (skills.length === 0) return ''
  // 将纯文本工具（无内置匹配的）也注入
  const dbTools = listTools().filter(t => t.enabled)
  const builtinMap = getBuiltinToolMap()
  const textOnlyTools = dbTools.filter(t => !builtinMap.has(t.name))

  const parts: string[] = []

  for (const skill of skills) {
    parts.push(`\n## Skill: ${skill.name}\n${skill.content}`)
  }
  for (const tool of textOnlyTools) {
    const text = tool.instruction || tool.description
    if (text) parts.push(`\n## Tool: ${tool.name}\n${text}`)
  }

  return parts.join('\n')
}
```

- [ ] **Step 2: 修改 ilink-bot.service.ts —— initAgentPool 用 DB 加载**

`initAgentPool` 改为 async，在 prompt 前追加 skill 文本：

```typescript
async function initAgentPool(provider: string, modelId: string): Promise<void> {
  const model = createModel(provider, modelId)
  const streamFn = createStreamFn()
  const tools = loadToolsFromDb()
  agentPool = new AgentPool(
    streamFn, tools, model,
    (p) => extractApiKey(p), ''
  )
}
```

在消息处理中，`effectivePrompt` 组装时追加 skills：

```typescript
const skillPrompt = await loadSkillPrompt()
const effectivePrompt = (userMode?.mode === 'learning'
  ? getLearningPrompt(userMode.learningTopic)
  : config.system_prompt) + (skillPrompt ? '\n\n' + skillPrompt : '')
```

- [ ] **Step 3: 修改 chat.service.ts —— 同样逻辑**

`getChatPool` 改为 async，`streamChat` 中组装 prompt 时追加 skills。

- [ ] **Step 4: 类型检查 + 测试**

```bash
cd server && npx tsc --noEmit && npx vitest run
```

- [ ] **Step 5: 提交**

```bash
git add server/src/services/ai/agent-pool.ts server/src/services/wechat/ilink-bot.service.ts server/src/services/chat.service.ts
git commit -m "feat: AgentPool 从 DB 加载工具和 skills"
```

---

### Task 6: 前端——ToolsManagerView

**Files:**
- Create: `src/views/ToolsManagerView.vue`
- Modify: `src/router/index.ts`

- [ ] **Step 1: 写入 ToolsManagerView.vue**

基于 Naive UI `n-data-table` + `n-modal` 弹窗。表格列：name / label / description / instruction / enabled(switch) / 操作(编辑/删除)。底部「新建工具」按钮。

弹窗表单字段：name(input)、label(input)、description(textarea)、instruction(textarea)、enabled(switch)。

API 调用使用 axios 直调 `/api/tool-config/*`（无需新增 store 文件）。

- [ ] **Step 2: 添加路由**

```typescript
{ path: '/tools-manager', component: () => import('@/views/ToolsManagerView.vue'), meta: { requiresAuth: true } },
```

- [ ] **Step 3: 类型检查**

```bash
npx vue-tsc --noEmit
```

- [ ] **Step 4: 提交**

```bash
git add src/views/ToolsManagerView.vue src/router/index.ts
git commit -m "feat: 工具管理页面"
```

---

### Task 7: 前端——SkillsManagerView

**Files:**
- Create: `src/views/SkillsManagerView.vue`
- Modify: `src/router/index.ts`

- [ ] **Step 1: 写入 SkillsManagerView.vue**

和 ToolsManagerView 类似的结构。额外：编辑弹窗中嵌入 CodeMirror Markdown 编辑器（`CodeMirrorMarkdownEditor` 组件已存在于项目中），读取文件内容后填入编辑器。

API 调用：
- 列表：`GET /api/skill-config/list`
- 文件内容：`GET /api/skill-config/:id/file`
- 保存文件：`PUT /api/skill-config/:id/file { content }`
- CRUD：同上

- [ ] **Step 2: 添加路由**

```typescript
{ path: '/skills-manager', component: () => import('@/views/SkillsManagerView.vue'), meta: { requiresAuth: true } },
```

- [ ] **Step 3: 类型检查**

```bash
npx vue-tsc --noEmit
```

- [ ] **Step 4: 提交**

```bash
git add src/views/SkillsManagerView.vue src/router/index.ts
git commit -m "feat: 技能管理页面"
```

---

### Task 8: 侧边栏添加菜单入口

**Files:**
- Modify: `src/components/common/AppSidebar.vue`

- [ ] **Step 1: 在侧边栏添加两个菜单项**

在现有导航列表中追加：

```vue
<n-menu-item key="tools-manager" label="工具管理" />
<n-menu-item key="skills-manager" label="技能管理" />
```

路由 key 和路径一致。

- [ ] **Step 2: 提交**

```bash
git add src/components/common/AppSidebar.vue
git commit -m "feat: 侧边栏新增工具/技能管理入口"
```

---

### Task 9: 最终验证

- [ ] **Step 1: 全量类型检查**

```bash
cd server && npx tsc --noEmit && cd .. && npx vue-tsc --noEmit
```

- [ ] **Step 2: 后端测试**

```bash
cd server && npx vitest run
```

- [ ] **Step 3: 手动验证清单**
  - [ ] 启动服务器，确认迁移执行
  - [ ] `GET /api/tool-config/list` 返回空数组
  - [ ] POST 新建工具，PUT 编辑，DELETE 删除
  - [ ] 前端页面正常渲染，CRUD 可用
  - [ ] bot 发消息确认正常回复

- [ ] **Step 4: 提交**

```bash
git commit -m "chore: 最终验证通过"
```
