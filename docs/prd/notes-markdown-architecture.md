# v1.8 笔记 Markdown 编辑器 - 架构设计

## 1. 概述

**模块**: notes-markdown
**版本**: v1.8
**目标**: 将笔记编辑器从 Tiptap 富文本切换为 CodeMirror 6 Markdown 编辑器，存储 Markdown 原文，支持图片粘贴/拖拽上传。

---

## 2. 数据库变更

### 2.1 Migration 文件

**路径**: `server/src/database/migrations/005_notes_content_format.sql`

```sql
-- 新增 content_format 字段，标识笔记内容格式
-- 'tiptap' = 存量 Tiptap JSON 格式（仅展示，不编辑）
-- 'markdown' = 新 Markdown 格式
ALTER TABLE notes ADD COLUMN content_format TEXT NOT NULL DEFAULT 'tiptap';
```

### 2.2 notes 表结构变更

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| content_format | TEXT | 'tiptap' | `'tiptap'` 或 `'markdown'` |

**存量笔记**: `content_format = 'tiptap'`，content 字段仍为 Tiptap JSON
**新笔记/转换后**: `content_format = 'markdown'`，content 字段为 Markdown 原文

### 2.3 content_text 同步策略

- 保存时直接提取 Markdown 纯文本写入 `content_text`（用于全文搜索）
- 不再需要 `extractText()` 的 Tiptap JSON 解析逻辑

---

## 3. API 接口契约

### 3.1 图片上传

**POST /api/upload**

描述: 上传图片文件，返回相对路径

Request:
- Content-Type: `multipart/form-data`
- Field: `file` (File)

Response:
```json
{ "url": "/uploads/uuid-filename.png" }
```

错误码: 400 (无效文件), 401 (未认证), 500 (服务器错误)

---

### 3.2 获取笔记图片列表

**GET /api/notes/:id/images**

描述: 获取某笔记引用的所有图片文件（基于 content 内容解析）

Response:
```json
{
  "images": [
    {
      "filename": "uuid-filename.png",
      "url": "/uploads/uuid-filename.png",
      "used_in_content": true
    }
  ]
}
```

错误码: 401, 404

---

### 3.3 删除已上传图片

**DELETE /api/upload/:filename**

描述: 删除服务器上的图片文件（物理删除）

Response: 204 No Content

错误码: 401, 404 (文件不存在)

---

### 3.4 更新笔记 (PATCH /api/notes/:id)

**变更点**: 支持 `content_format` 字段更新

Request:
```json
{
  "content": "# Markdown 内容",
  "content_format": "markdown"
}
```

Response: 更新后的 Note 对象（含 `content_format` 字段）

---

### 3.5 获取笔记 (GET /api/notes/:id)

**响应结构**:
```json
{
  "id": 1,
  "title": "标题",
  "content": "# Markdown 原文 或 Tiptap JSON",
  "content_format": "markdown | tiptap",
  "content_text": "纯文本",
  "tags": [],
  "is_pinned": false,
  "is_archived": false,
  "created_at": "...",
  "updated_at": "..."
}
```

---

## 4. 后端服务变更

### 4.1 notes.service.ts

**变更**:
1. `Note` 接口新增 `content_format: 'tiptap' | 'markdown'` 字段
2. `rowToNote()` 映射新增字段
3. `createNote()` 新建笔记默认 `content_format = 'markdown'`
4. `updateNote()` 支持 `content_format` 更新
5. `extractText()` 保留 Tiptap JSON 解析（存量兼容），新增 Markdown 纯文本提取

**Markdown 转纯文本**:
```typescript
function extractTextFromMarkdown(markdown: string): string {
  // 去除 Markdown 语法符号，保留纯文本
  return markdown
    .replace(/!\[.*?\]\(.*?\)/g, '') // 去除图片语法
    .replace(/\[.*?\]\(.*?\)/g, '$1') // 去除链接，保留文本
    .replace(/[#*`_~\[\]]/g, '')       // 去除标题/加粗/斜体等符号
    .replace(/\n+/g, ' ')             // 合并换行
    .slice(0, 500)
}
```

### 4.2 新建 upload.routes.ts

**路由前缀**: `/api/upload`

| 方法 | 路径 | 控制器 | 描述 |
|------|------|--------|------|
| POST | `/` | uploadImage | 上传单张图片 |
| DELETE | `/:filename` | deleteImage | 删除图片文件 |

**存储路径**: `{project_root}/uploads/`（相对于项目根目录）

**文件命名**: `uuid-v4.png`（保留扩展名）

**静态服务**: 开发环境 Vite 代理 `/uploads/*` 到 `http://localhost:3000/uploads/*`；生产环境 Express 静态托管

### 4.3 新建 upload.controller.ts

**uploadImage**:
1. 接收 `multipart/form-data` 的 `file` 字段
2. 生成 UUID 文件名（使用 `crypto.randomUUID()`）
3. 写入 `uploads/` 目录
4. 返回 `{ url: '/uploads/uuid-filename.png' }`

**deleteImage**:
1. 验证文件名安全（禁止 `../` 路径穿越）
2. 检查文件是否存在
3. 执行物理删除

### 4.4 新建 notes.controller.ts 变更

**getNoteImages** (新增):
1. 根据 note id 获取 note content
2. 用正则解析 Markdown 中的图片 URL（`![](url)`）
3. 提取 filename，验证文件是否存在
4. 返回图片列表（含 `used_in_content` 标记）

---

## 5. 前端变更

### 5.1 新建组件

**src/components/notes/CodeMirrorMarkdownEditor.vue**

功能:
- CodeMirror 6 编辑器（`@codemirror/view` + `@codemirror/state` + `@codemirror/lang-markdown`）
- 分屏布局：左侧编辑，右侧预览
- Markdown 语法高亮
- 快捷键支持（Ctrl+B 加粗、Ctrl+I 斜体等）
- 图片粘贴/拖拽上传，插入 `![](URL)` 语法

**src/components/notes/MarkdownPreview.vue**

功能:
- 使用 `marked` 或 `markdown-it` 渲染 Markdown
- 接收 Markdown 字符串，输出 HTML
- 支持同步渲染

**src/components/notes/ImageManager.vue**

功能:
- 展示笔记引用的所有图片
- 支持删除操作（调用 DELETE /api/upload/:filename）
- 用户确认后物理删除

### 5.2 NoteDetailView.vue 变更

- 区分渲染模式：`content_format === 'tiptap'` 时渲染 TiptapEditor（只读提示），`content_format === 'markdown'` 时渲染 CodeMirrorMarkdownEditor
- 新建笔记默认使用 Markdown 编辑器
- 存量 Tiptap 笔记首次编辑时弹出迁移提示

### 5.3 note.store.ts 变更

- `Note` 类型新增 `content_format: 'tiptap' | 'markdown'`
- 无需变更业务逻辑（自动保存逻辑不变）

### 5.4 新增 API 方法

**src/api/upload.api.ts**:
```typescript
export const uploadApi = {
  uploadImage: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<{ url: string }>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  deleteImage: (filename: string) => api.delete(`/upload/${filename}`)
}
```

**src/api/notes.api.ts 新增**:
```typescript
getNoteImages: (id: number) => api.get<{ images: NoteImage[] }>(`/notes/${id}/images`)
```

### 5.5 Tiptap JSON 转 Markdown 转换器

**src/utils/tiptapToMarkdown.ts**:

用于首次编辑存量 Tiptap 笔记时转换为 Markdown：

转换规则:
| Tiptap Node | Markdown |
|-------------|----------|
| paragraph | 原文输出 |
| heading (1-6) | `#` - `######` |
| bold | `**text**` |
| italic | `*text*` |
| code | `` `code` `` |
| codeBlock | ```` ```lang\ncode\n``` ```` |
| bulletList | `- item` |
| orderedList | `1. item` |
| taskList | `- [ ] item` |
| blockquote | `> blockquote` |
| image | `![alt](src)` |
| horizontalRule | `---` |

---

## 6. 目录结构变更

```
server/src/
  routes/
    upload.routes.ts       # 新增
  controllers/
    upload.controller.ts   # 新增
  services/
    notes.service.ts       # 修改
  database/migrations/
    005_notes_content_format.sql  # 新增

src/
  components/notes/
    CodeMirrorMarkdownEditor.vue  # 新增
    MarkdownPreview.vue           # 新增
    ImageManager.vue              # 新增
    TiptapEditor.vue              # 保留（存量展示）
  api/
    upload.api.ts        # 新增
  utils/
    tiptapToMarkdown.ts  # 新增
  views/
    NoteDetailView.vue   # 修改
  stores/
    note.store.ts        # 修改（类型变更）
```

---

## 7. 技术选型

| 能力 | 选型 | 版本 |
|------|------|------|
| Markdown 编辑器 | @codemirror/view + @codemirror/state + @codemirror/lang-markdown | ^6.x |
| Markdown 渲染 | marked | ^15.x |
| 图片粘贴/拖拽 | CodeMirror 的 `image()` 插件 + DOM paste/drag 事件 | - |
| UUID 生成 | `crypto.randomUUID()` (Node.js 内置) | - |
| Tiptap → Markdown | 自研转换器 `tiptapToMarkdown.ts` | - |

---

## 8. 向后兼容策略

1. **存量笔记展示**: `content_format = 'tiptap'` 时，NoteDetailView 继续渲染 TiptapEditor（只读），提示用户"此笔记为旧格式"
2. **首次编辑转换**: 用户点击编辑时，检测 `content_format = 'tiptap'`，弹出确认框，转换后保存为 Markdown
3. **数据库兼容**: `content_format` 字段有默认值 `'tiptap'`，不影响现有笔记
4. **静态资源**: 图片文件物理存储在 `uploads/` 目录，笔记删除后图片不自动清理（由 ImageManager 手动管理）

---

## 9. 验收检查点

- [ ] 新建笔记 `content_format = 'markdown'`
- [ ] 存量 Tiptap 笔记 `content_format = 'tiptap'`，展示页正常渲染
- [ ] 首次编辑 Tiptap 笔记时弹出迁移提示
- [ ] 粘贴图片插入 `![](uploads/uuid.png)` 语法
- [ ] 拖拽图片与粘贴行为一致
- [ ] 预览区实时渲染，与编辑器滚动位置同步
- [ ] Ctrl+B 加粗、Ctrl+I 斜体快捷键生效
- [ ] 图片管理界面可查看和删除笔记引用的图片
- [ ] 保存后 `content_text` 同步更新
- [ ] `uploads/` 目录下的文件可被访问（静态服务）
