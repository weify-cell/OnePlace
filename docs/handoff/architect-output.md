# Architect 输出 - 笔记 Markdown 编辑器

## 迭代信息

| 字段 | 值 |
|------|-----|
| 版本号 | v1.8 |
| 模块标识 | notes-markdown |
| 架构版本 | v1.0 |
| 设计日期 | 2026-04-01 |

---

## 一、核心设计决策

### 1. 存储格式

**决策：content 字段直接存储 Markdown 原文**

- 新建笔记 `content_format = 'markdown'`，content = Markdown 原文
- 存量 Tiptap JSON 笔记 `content_format = 'tiptap'`，content = Tiptap JSON（仅展示）
- `content_text` 在保存时同步提取，用于全文搜索

### 2. 图片上传

**决策：上传到服务器 `/api/upload`，存储在 `{项目根目录}/uploads/`**

- 粘贴/拖拽图片 → `POST /api/upload` → 返回 `/uploads/uuid-filename.png`
- 编辑器插入 `![](uploads/uuid-filename.png)` 语法
- 图片文件名: `crypto.randomUUID()` 生成 UUID v4

### 3. 编辑器选型

**决策: CodeMirror 6**

- 包: `@codemirror/view` + `@codemirror/state` + `@codemirror/lang-markdown`
- 预览: `marked` 库同步渲染
- 极简模式: 无工具栏，靠 Markdown 语法和快捷键

### 4. 向后兼容

**存量 Tiptap 笔记首次编辑时转换**:
- 检测 `content_format = 'tiptap'` 时显示只读 Tiptap + 迁移提示
- 用户确认后 `tiptapToMarkdown.ts` 转换 → `content_format = 'markdown'` → 保存

---

## 二、数据库变更

**Migration**: `server/src/database/migrations/005_notes_content_format.sql`

```sql
ALTER TABLE notes ADD COLUMN content_format TEXT NOT NULL DEFAULT 'tiptap';
```

**notes 表变更**:

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| content_format | TEXT | 'tiptap' | `'tiptap'` 或 `'markdown'` |

---

## 三、API 接口

### POST /api/upload
- Request: `multipart/form-data`, field `file`
- Response: `{ url: "/uploads/uuid-filename.png" }`
- 错误: 400 (无文件), 401, 500

### GET /api/notes/:id/images
- Response: `{ images: [{ filename, url, used_in_content }] }`

### DELETE /api/upload/:filename
- Response: 204 No Content
- 错误: 401, 404

### PATCH /api/notes/:id
- 新增支持 `content_format` 字段更新

---

## 四、后端文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/src/routes/upload.routes.ts` | 新增 | `/api/upload` 路由 |
| `server/src/controllers/upload.controller.ts` | 新增 | `uploadImage`, `deleteImage`, `getNoteImages` |
| `server/src/services/notes.service.ts` | 修改 | `content_format` 支持 |
| `server/src/database/migrations/005_notes_content_format.sql` | 新增 | 数据库迁移 |

**notes.service.ts 变更摘要**:
- `Note` 接口新增 `content_format: 'tiptap' | 'markdown'`
- `createNote()` 默认 `content_format = 'markdown'`
- `updateNote()` 支持更新 `content_format`
- 新增 `extractTextFromMarkdown()` 函数

---

## 五、前端文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/notes/CodeMirrorMarkdownEditor.vue` | 新增 | CodeMirror 6 Markdown 编辑器 |
| `src/components/notes/MarkdownPreview.vue` | 新增 | marked 渲染预览 |
| `src/components/notes/ImageManager.vue` | 新增 | 图片历史管理 |
| `src/api/upload.api.ts` | 新增 | 图片上传/删除 API |
| `src/utils/tiptapToMarkdown.ts` | 新增 | Tiptap JSON → Markdown 转换器 |
| `src/types/index.ts` | 修改 | `Note` 接口新增 `content_format` |
| `src/api/notes.api.ts` | 修改 | 新增 `getNoteImages` |
| `src/views/NoteDetailView.vue` | 修改 | 区分 Tiptap/Markdown 渲染模式 |

---

## 六、前端开发需要读取的文档

- `docs/prd/notes-markdown-architecture.md` — 完整架构设计
- `docs/api/notes-markdown-api.md` — 接口契约
- `src/components/notes/TiptapEditor.vue` — 现有 Tiptap 编辑器参考

---

## 七、后端开发需要读取的文档

- `docs/prd/notes-markdown-architecture.md` — 完整架构设计
- `docs/api/notes-markdown-api.md` — 接口契约
- `docs/db/notes-markdown-schema.sql` — 数据库变更
- `server/src/services/notes.service.ts` — 现有 notes service 参考
- `server/src/routes/notes.routes.ts` — 现有路由注册参考

---

## 八、验收要点（供 tester agent 参考）

1. 新建笔记 `content_format = 'markdown'`，编辑区为空白 CodeMirror
2. 存量 Tiptap 笔记 `content_format = 'tiptap'`，展示页正常渲染
3. 首次编辑 Tiptap 笔记时弹出迁移提示，确认后保存变为 Markdown
4. 粘贴图片 → 上传成功 → 插入 `![](uploads/uuid.png)`
5. 拖拽图片与粘贴行为一致
6. 预览区实时渲染，与编辑器滚动位置同步
7. Ctrl+B 加粗、Ctrl+I 斜体快捷键生效
8. 图片管理界面可查看和删除笔记引用的图片
9. 保存后 `content_text` 同步更新
10. `/uploads/` 目录下的文件可通过 URL 访问

---

## 九、下游状态

- [x] 架构设计 → 已完成
- [ ] 前端开发 → 待 frontend agent
- [ ] 测试验收 → 待 tester agent
