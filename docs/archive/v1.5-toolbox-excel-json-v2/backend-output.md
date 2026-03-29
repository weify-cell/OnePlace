# Backend 交接输出 — v1.2 笔记文件夹 + 标签系统

## 交接时间
2026-03-21

---

## 已完成

### 0. Bug 修复（2026-03-21，由 Tester 分派）
- 已修复：#BUG-001 — `notes.service.ts:49` traverse 回调改为显式 cast：`child => traverse(child as { text?: string; content?: unknown[] })`
- 已修复：#BUG-002 — `settings.controller.ts` getSetting/setSetting 顶部提取 `const key = req.params.key as string`，消除 TS2345
- 后端类型检查 `cd server && npm run typecheck` 通过，0 错误

### 1. 数据库迁移
- `server/src/database/migrations/004_notes_folder_tag.sql` — 已存在且内容正确，无需修改

### 2. 新增文件夹模块
- `server/src/services/folders.service.ts` — getFolders / getFolderById / createFolder / renameFolder / deleteFolder（事务）
- `server/src/controllers/folders.controller.ts` — GET / POST / PATCH / DELETE 控制器
- `server/src/routes/folders.routes.ts` — 路由定义（PATCH 而非 PUT，与 architect 契约一致）

### 3. 笔记服务更新（`server/src/services/notes.service.ts`）
- `Note` 接口新增 `folder_id: number | null`
- `NoteRow` 同步新增 `folder_id`
- `rowToNote()` 正确映射 `folder_id`（用 `?? null` 处理 SQLite undefined）
- `NoteQuery` 新增 `folder_id?: number | 'none'`
- `getNotes()` 支持 `folder_id = 数字` 或 `folder_id IS NULL`（传 'none' 时）两种筛选
- `createNote()` 接受可选 `{ folder_id }` 参数
- `updateNote()` 使用 `'folder_id' in data` 判断（支持显式传 null 将笔记移出文件夹）

### 4. 笔记控制器更新（`server/src/controllers/notes.controller.ts`）
- `getNotes()` 透传 `folder_id` 查询参数，'none' 原样传递，数字字符串转 Number
- `createNote()` 从 req.body 读取 `folder_id`

### 5. 路由注册（`server/src/index.ts`）
- 新增 `import { foldersRouter }` 并注册 `app.use('/api/folders', foldersRouter)`
- 受现有 `authMiddleware` 自动保护

---

## 接口与文档的偏差

| 偏差点 | 文档 | 实现 | 原因 |
|--------|------|------|------|
| 重命名接口方法 | PUT /api/folders/:id | PATCH /api/folders/:id | architect-output.md 正文写的是 PATCH，任务描述写 PUT；以 architect 契约为准，PATCH 语义更准确（部分更新） |

---

## 注意事项

- `deleteFolder` 使用 `db.transaction()` 包裹：先 UPDATE notes.folder_id = NULL，再软删除 folder，保证原子性
- `updateNote` 的 `folder_id` 判断用 `'folder_id' in data` 而非 `!== undefined`，这样前端传 `{ folder_id: null }` 时也能正确将笔记移出文件夹
- `getNotes` 的 folder_id 筛选不影响 is_archived 等其他现有条件，完全正交

---

## 待解决问题

无

---

## 前端对接提示

- `POST /api/notes` body 新增可选 `folder_id: number | null`
- `PATCH /api/notes/:id` body 可传 `folder_id: number | null` 或 `tags: string[]`
- `GET /api/notes?folder_id=1` 筛选文件夹；`?folder_id=none` 筛选无文件夹的笔记
- `GET /api/folders` 返回 `{ items: Folder[] }`
- `PATCH /api/folders/:id` 重命名（注意是 PATCH 不是 PUT）
