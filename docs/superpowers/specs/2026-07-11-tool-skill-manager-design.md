# 工具广场与技能管理设计

> 版本：v2.1 | 日期：2026-07-11 | 状态：待实施

## 背景

当前 13 个 Agent 工具硬编码在 `builtin-tools.ts`，描述和指令写在代码里，无法通过 UI 调整。pi-agent-core 内置 skills 系统（从 SKILL.md 文件加载），但无管理界面。需要对工具和技能提供统一的可视化管理——启停、编辑、新建、删除——依赖用户自行配置后生效。

## 非目标

- 不在 UI 上编辑工具的 execute 逻辑（代码实现）
- 不改变现有 DB schema（新增两张表，不修改旧表）
- 不改变前端路由守卫逻辑

## 数据模型

新增 `tools` 和 `skills` 两张表。

```sql
CREATE TABLE IF NOT EXISTS tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                -- 工具名，可编辑
  label TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  instruction TEXT NOT NULL DEFAULT '', -- 自定义指令，追加到工具描述后
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                -- 技能名，可编辑
  path TEXT NOT NULL DEFAULT '',      -- SKILL.md 文件路径
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

## 运行时加载逻辑

```
启动时：
  遍历 tools 表中 enabled=1 的行
    ├── name 匹配内置工具名
    │     → 用 DB 的 description + instruction 覆盖
    │     → execute 绑定代码中的函数
    │     → 加入 Agent tools 数组
    └── name 不匹配任何内置工具
          → 无 execute，description + instruction 作为纯文本注入 system prompt

  遍历 skills 表中 enabled=1 的行
    → 读取 path 对应的 SKILL.md 文件
    → formatSkillsForSystemPrompt() 注入 system prompt
```

**代码参考**：`builtin-tools.ts` 改为导出 `Map<name, AgentTool>`，加载函数按需从中取 execute。

**DB 为唯一配置源**：表中未出现的工具不加载，不设默认启用。

## API

### 工具

```
GET    /api/tool-config/list          → 返回全部工具记录
POST   /api/tool-config               → 新建 { name, label, description, instruction, enabled }
PUT    /api/tool-config/:id           → 更新 { name, label, description, instruction, enabled }
DELETE /api/tool-config/:id           → 删除
```

### 技能

```
Skills 文件存储目录：`server/data/skills/`（相对于项目根目录），文件名由 `path` 字段指定。如 `path = "code-review.md"` 则读取 `server/data/skills/code-review.md`。

**注意**：`name` 字段无唯一约束（可编辑），运行时多个同名工具取第一个匹配的，日志输出警告。
POST   /api/skill-config               → 新建 { name, path, enabled }
PUT    /api/skill-config/:id           → 更新
DELETE /api/skill-config/:id           → 删除（同时删除文件）
GET    /api/skill-config/:id/file      → 读取 SKILL.md 文件内容
PUT    /api/skill-config/:id/file      → 写入 SKILL.md 文件内容

GET    /api/skill-config/enabled       → 返回 enabled=1 的技能，含文件内容（agent 内部用）
```

Skills 文件存储路径：`server/data/skills/{name}.md`，由 `path` 字段相对或绝对指定。

## 前端

侧边栏新增两个一级菜单：

| 路由 | 页面 | 功能 |
|------|------|------|
| `/tools-manager` | ToolsManagerView.vue | 表格列表 + 新建/编辑弹窗 + 删除确认 |
| `/skills-manager` | SkillsManagerView.vue | 表格列表 + 新建/编辑弹窗 + 点击行展开 CodeMirror 编辑器写文件 + 删除确认 |

两个页面结构相同：`AppLayout` → 表头 + `n-data-table` → 弹窗表单。Skills 页面额外内嵌 CodeMirror Markdown 编辑器。

## 变更文件

| 文件 | 变更 | 说明 |
|------|------|------|
| `server/src/database/migrations/019_tools_skills.sql` | 新建 | 建表迁移 |
| `server/src/services/ai/builtin-tools.ts` | 修改 | 改为导出 `Map<name, AgentTool>` |
| `server/src/services/ai/agent-pool.ts` | 修改 | `tools` 参数改为从 DB 加载 |
| `server/src/services/tool-config.service.ts` | 新建 | tools 表 CRUD |
| `server/src/services/skill-config.service.ts` | 新建 | skills 表 CRUD + 文件读写 |
| `server/src/controllers/tool-config.controller.ts` | 新建 | API 控制器 |
| `server/src/controllers/skill-config.controller.ts` | 新建 | API 控制器 |
| `server/src/routes/tool-config.routes.ts` | 新建 | 路由 |
| `server/src/routes/skill-config.routes.ts` | 新建 | 路由 |
| `server/src/index.ts` | 修改 | 注册新路由 |
| `server/src/services/wechat/ilink-bot.service.ts` | 修改 | 从 DB 加载工具和 skills |
| `server/src/services/chat.service.ts` | 修改 | 同上 |
| `src/views/ToolsManagerView.vue` | 新建 | 工具管理页面 |
| `src/views/SkillsManagerView.vue` | 新建 | 技能管理页面 |
| `src/router/index.ts` | 修改 | 添加路由 |
