# 前端开发输出 - 笔记 Markdown 编辑器 v1.8

## 迭代信息

| 字段 | 值 |
|------|-----|
| 版本号 | v1.8 |
| 模块标识 | notes-markdown |
| 迭代目标 | 将笔记编辑器从 Tiptap 富文本切换为 CodeMirror 6 Markdown 编辑器 |
| 完成日期 | 2026-04-02 |

---

## 已完成工作

### 1. 新增依赖
**文件**: `package.json`

新增依赖：
- `@codemirror/commands` ^6.8.1
- `@codemirror/lang-markdown` ^6.3.2
- `@codemirror/language` ^6.11.0
- `@codemirror/search` ^6.5.10
- `@codemirror/state` ^6.5.2
- `@codemirror/view` ^6.36.5
- `@lezer/highlight` ^1.2.1
- `marked` ^15.0.7

### 2. 类型更新
**文件**: `src/types/index.ts`

变更：
- `Note` 接口新增 `content_format?: 'tiptap' | 'markdown'` 字段
- 新增 `NoteImage` 接口：`{ filename, url, used_in_content }`

### 3. API 新增
**文件**: `src/api/upload.api.ts`（新建）

```typescript
export const uploadApi = {
  uploadImage: (file: File) => { /* multipart/form-data POST /upload */ },
  deleteImage: (filename: string) => { /* DELETE /upload/:filename */ }
}
```

**文件**: `src/api/notes.api.ts`（修改）

新增方法：
- `getNoteImages(id)` → `GET /notes/:id/images`

### 4. Tiptap → Markdown 转换器
**文件**: `src/components/editor/TiptapToMarkdown.ts`（新建）

功能：Tiptap JSON → Markdown 字符串转换，支持：
- paragraph, heading (h1-h6)
- bold, italic, code, strike, link
- bulletList, orderedList, taskList
- blockquote, codeBlock, image, horizontalRule

### 5. Markdown 预览组件
**文件**: `src/components/notes/MarkdownPreview.vue`（新建）

功能：
- 使用 `marked` 渲染 Markdown 为 HTML
- 支持 h1-h6, p, ul/ol, blockquote, code, pre, img, table, hr
- 响应式深色模式样式

### 6. 图片管理组件
**文件**: `src/components/notes/ImageManager.vue`（新建）

功能：
- 展示笔记引用的所有图片（调用 `GET /notes/:id/images`）
- 删除图片（调用 `DELETE /upload/:filename`）
- 显示使用状态（used/unused）
- 确认对话框防误删

### 7. CodeMirror Markdown 编辑器
**文件**: `src/components/notes/CodeMirrorMarkdownEditor.vue`（新建）

功能：
- CodeMirror 6 + Markdown 语言支持
- 分屏布局：左侧编辑，右侧预览（可切换）
- 快捷键：
  - `Ctrl+B` 加粗 `**text**`
  - `Ctrl+I` 斜体 `*text*`
  - `Ctrl+Shift+K` 行内代码 `` `code` ``
  - `Ctrl+Shift+I` 插入图片 URL
- 图片粘贴/拖拽上传，自动插入 `![alt](url)` 语法
- 工具栏：加粗、斜体、代码、插入图片、切换预览

### 8. 笔记详情页重构
**文件**: `src/views/NoteDetailView.vue`（修改）

变更：
- `isLegacyNote`: `content_format === 'tiptap'` 或未定义
- `isMarkdownNote`: `content_format === 'markdown'`
- 存量 Tiptap 笔记：显示只读 TiptapEditor + 迁移提示框
- Markdown 笔记：使用 CodeMirrorMarkdownEditor
- 新建笔记：默认 `content_format = 'markdown'`（note.store.ts createNote 已更新）
- 迁移流程：点击「编辑笔记」→ 确认对话框 → Tiptap JSON 转 Markdown → 保存

### 9. 笔记 Store 更新
**文件**: `src/stores/note.store.ts`（修改）

变更：
- `createNote()`: 新建笔记默认 `content_format = 'markdown'`
- `updateNote()`: 支持 `content_format` 字段更新（通过 `Partial<Note>` 类型）

---

## 文件清单

| 文件 | 变更类型 |
|------|---------|
| `package.json` | 修改 |
| `src/types/index.ts` | 修改 |
| `src/api/upload.api.ts` | 新增 |
| `src/api/notes.api.ts` | 修改 |
| `src/components/editor/TiptapToMarkdown.ts` | 新增 |
| `src/components/notes/MarkdownPreview.vue` | 新增 |
| `src/components/notes/ImageManager.vue` | 新增 |
| `src/components/notes/CodeMirrorMarkdownEditor.vue` | 新增 |
| `src/views/NoteDetailView.vue` | 修改 |
| `src/stores/note.store.ts` | 修改 |

---

## 技术实现细节

### 编辑器架构
```
NoteDetailView
├── TiptapEditor（存量 tiptap 笔记，只读展示）
└── CodeMirrorMarkdownEditor（Markdown 笔记）
    ├── 工具栏（加粗/斜体/代码/图片/预览切换）
    ├── 左侧：CodeMirror 6 编辑器
    └── 右侧：MarkdownPreview 实时预览
```

### 图片上传流程
1. 粘贴/拖拽图片 → `handlePaste/handleDrop`
2. 调用 `uploadApi.uploadImage(file)`
3. 返回 URL 后插入 `![filename](url)` 到编辑器
4. 触发 `update:content` 更新 store

### 迁移流程
1. 用户编辑存量 Tiptap 笔记
2. 弹出确认对话框「此笔记为旧格式，首次编辑将自动转换」
3. 用户确认 → `tiptapToMarkdown(note.content)` 转换
4. 保存 `{ content: markdown, content_format: 'markdown' }`
5. 重新获取笔记数据

### content_format 状态机
| 状态 | 渲染 | 说明 |
|------|------|------|
| `tiptap` | TiptapEditor + 迁移提示 | 存量笔记，仅展示 |
| `undefined` | 同上 | 兼容未迁移的存量笔记 |
| `markdown` | CodeMirrorMarkdownEditor | 新格式/已迁移 |

---

## 待验证

- [ ] 新建笔记 `content_format = 'markdown'`
- [ ] 存量 Tiptap 笔记 `content_format = 'tiptap'`，展示页正常渲染
- [ ] 首次编辑 Tiptap 笔记时弹出迁移提示
- [ ] 粘贴图片插入 `![](uploads/uuid.png)` 语法
- [ ] 拖拽图片与粘贴行为一致
- [ ] 预览区实时渲染
- [ ] Ctrl+B 加粗、Ctrl+I 斜体快捷键生效
- [ ] 图片管理界面可查看和删除笔记引用的图片
- [ ] 保存后 `content_text` 同步更新（后端处理）

---

## 注意事项

- 迁移是单向的：Tiptap → Markdown，无法回退
- 图片删除后笔记内容中的引用不会自动清理（需手动）
- 后端需实现 `server/src/routes/upload.routes.ts` 等文件才可完整运行

---

## 上一迭代

- v1.7 | 百宝箱 - 文本比较工具交互重构 | 2026-03-29 | docs/archive/v1.7-toolbox-text-diff/
