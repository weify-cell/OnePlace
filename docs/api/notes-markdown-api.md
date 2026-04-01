# 笔记 Markdown 编辑器 - 接口文档

## 1. 图片上传

### POST /api/upload

上传图片文件到服务器，返回相对路径。

**Request**

- Content-Type: `multipart/form-data`
- Field: `file` (File)

**Response** `200 OK`

```json
{
  "url": "/uploads/550e8400-e29b-41d4-a716-446655440000.png"
}
```

**Error Responses**

| Status | Body | 说明 |
|--------|------|------|
| 400 | `{ error: 'No file provided' }` | 未提供文件 |
| 401 | `{ error: 'Unauthorized' }` | 未认证 |
| 500 | `{ error: 'Upload failed' }` | 服务器错误 |

---

## 2. 获取笔记图片列表

### GET /api/notes/:id/images

获取某笔记引用的所有图片文件列表。

**Response** `200 OK`

```json
{
  "images": [
    {
      "filename": "550e8400-e29b-41d4-a716-446655440000.png",
      "url": "/uploads/550e8400-e29b-41d4-a716-446655440000.png",
      "used_in_content": true
    }
  ]
}
```

**Error Responses**

| Status | Body | 说明 |
|--------|------|------|
| 401 | `{ error: 'Unauthorized' }` | 未认证 |
| 404 | `{ error: 'NotFound' }` | 笔记不存在 |

---

## 3. 删除已上传图片

### DELETE /api/upload/:filename

删除服务器上的图片文件（物理删除）。

**Path Parameters**

| 参数 | 类型 | 说明 |
|------|------|------|
| filename | string | 图片文件名（如 `550e8400-e29b-41d4-a716-446655440000.png`） |

**Response** `204 No Content`

**Error Responses**

| Status | Body | 说明 |
|--------|------|------|
| 401 | `{ error: 'Unauthorized' }` | 未认证 |
| 404 | `{ error: 'File not found' }` | 文件不存在 |

**Security**: 禁止路径穿越（`../`），只允许删除 `uploads/` 目录下的文件。

---

## 4. 获取笔记（含 content_format）

### GET /api/notes/:id

**Response** `200 OK`

```json
{
  "id": 1,
  "title": "笔记标题",
  "content": "# Markdown 内容 或 Tiptap JSON",
  "content_format": "markdown",
  "content_text": "纯文本提取用于搜索",
  "tags": ["工作"],
  "folder_id": null,
  "is_pinned": false,
  "is_archived": false,
  "is_deleted": false,
  "created_at": "2026-04-01T00:00:00.000Z",
  "updated_at": "2026-04-01T00:00:00.000Z"
}
```

---

## 5. 更新笔记

### PATCH /api/notes/:id

**Request Body**

```json
{
  "title": "新标题",
  "content": "# Markdown 原文",
  "content_format": "markdown",
  "tags": ["工作", "重要"]
}
```

所有字段可选，只更新提供的字段。

**Response** `200 OK` — 返回更新后的 Note 对象

---

## 6. 新建笔记

### POST /api/notes

**Request Body**

```json
{
  "folder_id": null
}
```

**Response** `201 Created`

新建笔记默认 `content_format = 'markdown'`，`content = ''`

---

## 7. 错误码汇总

| HTTP Status | error | 说明 |
|-------------|-------|------|
| 400 | `No file provided` | POST /api/upload 未提供文件 |
| 401 | `Unauthorized` | 未认证或 token 过期 |
| 404 | `NotFound` | 资源不存在 |
| 404 | `File not found` | DELETE /api/upload/:filename 文件不存在 |
| 500 | `Upload failed` | 文件保存失败 |

---

## 前端调用文档

### 后端需要实现的文件

- `server/src/routes/upload.routes.ts` — 路由注册
- `server/src/controllers/upload.controller.ts` — 控制器
- `server/src/services/upload.service.ts` — 上传逻辑（可选，逻辑简单可内联到 controller）
- `server/src/database/migrations/005_notes_content_format.sql` — 数据库迁移

### 前端需要调用的文件

- `docs/prd/notes-markdown-architecture.md` — 架构设计
- `docs/api/notes-markdown-api.md` — 本文档（接口契约）
- `docs/db/notes-markdown-schema.sql` — 数据库变更（如需单独查看）

### notes.service.ts 变更摘要

1. `Note` 接口: 新增 `content_format: 'tiptap' | 'markdown'`
2. `NoteRow` 接口: 新增 `content_format: string`
3. `rowToNote()`: 映射 `content_format`
4. `createNote()`: 默认 `content_format = 'markdown'`
5. `updateNote()`: 支持更新 `content_format`
6. 新增 `extractTextFromMarkdown()` 函数
