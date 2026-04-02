# Backend 交接输出 — v1.8 笔记 Markdown 编辑器

## 交接时间
2026-04-01

---

## 已完成

### 1. 数据库迁移
- `server/src/database/migrations/005_notes_content_format.sql` — 已存在，新增 `content_format` 字段，默认值 `'tiptap'`

### 2. 新增上传模块
- `server/src/services/upload.service.ts` — saveUploadedFile / deleteFile / fileExists / getNoteImages / parseImagesFromContent
- `server/src/controllers/upload.controller.ts` — uploadImage / deleteImage / getNoteImages
- `server/src/routes/upload.routes.ts` — POST /api/upload, DELETE /api/upload/:filename

### 3. 笔记服务更新（`server/src/services/notes.service.ts`）
- `Note` 接口新增 `content_format: 'tiptap' | 'markdown'`
- `NoteRow` 同步新增 `content_format: string`
- `rowToNote()` 映射 `content_format` 字段
- `createNote()` 新建笔记默认 `content_format = 'markdown'`
- `updateNote()` 支持更新 `content_format`，提取纯文本时根据 format 选择解析方式
- 新增 `extractTextFromMarkdown()` 函数：去除 Markdown 语法符号，保留纯文本

### 4. 笔记控制器更新（`server/src/controllers/notes.controller.ts`）
- `getNoteImages()` — 解析笔记内容中的图片 URL，验证文件存在性，返回图片列表

### 5. 路由注册（`server/src/index.ts`）
- 新增 `import { uploadRouter }` 并注册 `app.use('/api/upload', uploadRouter)`
- 新增静态文件服务 `app.use('/uploads', express.static(uploadsPath))`
- 新增 `GET /api/notes/:id/images` 路由

### 6. 依赖安装
- `npm install multer` — 文件上传中间件
- `npm install -D @types/multer`

---

## 接口与文档的偏差

无

---

## 注意事项

- 上传服务使用 `crypto.randomUUID()` 生成文件名，保留原始扩展名
- 删除图片时有路径穿越防护（禁止 `../`、`/`、`\`）
- `getNoteImages` 从 Markdown 内容中解析 `![](url)` 格式的图片引用
- 生产/开发环境均通过 Express 静态服务提供 `/uploads/*` 访问

---

## 待解决问题

无

---

## 前端对接提示

- `POST /api/upload` — multipart/form-data，field 为 `file`，返回 `{ url: string }`
- `DELETE /api/upload/:filename` — 删除图片，204 No Content
- `GET /api/notes/:id/images` — 返回 `{ images: [{ filename, url, used_in_content }] }`
- `POST /api/notes` 新建笔记默认 `content_format = 'markdown'`
- `PATCH /api/notes/:id` 可传 `content_format: 'markdown'` 和 `content: string`
