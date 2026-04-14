# 上传本地文件作为笔记

## 概述

在笔记列表页新增「上传笔记」功能，支持将本地 .txt / .md 文件内容导入为新笔记。

## 交互流程

1. 用户在 `NotesView` 工具栏点击「上传笔记」按钮
2. 弹出 `n-modal` 对话框，包含：
   - **拖拽/点击上传区** — 支持拖拽或点击选择文件
   - **文件夹选择下拉框** — `n-select`，默认"无文件夹"
   - **文件预览** — 上传后显示文件名和大小，确认后可更换文件
3. 点击「确认」：读取文件内容 → 调用 `POST /api/notes` 创建笔记 → 关闭弹窗 → 跳转到新笔记详情页
4. 上传中：显示 loading 状态
5. 失败：显示错误提示，弹窗不关闭

## 文件类型限制

- 仅接受 `.txt` 和 `.md` 文件
- 其他类型：Naive UI message 提示"仅支持 .txt 和 .md 文件"

## 后端变更

- 新增 `POST /api/upload/note` 路由（multer 单文件上传）
- 读取文件内容，返回新创建的笔记 ID 和内容（用于跳转）

## 前端变更

| 文件 | 变更 |
|------|------|
| `src/views/NotesView.vue` | 新增「上传笔记」按钮 |
| `src/components/notes/UploadNoteModal.vue` | 新建：上传弹窗组件 |
| `src/api/upload.api.ts` | 新增 `uploadNoteFile(file, folderId)` 方法 |
| `src/stores/note.store.ts` | `createNote` 返回完整 note 对象（含 id） |

## 错误处理

- 文件类型不符 → `message.error('仅支持 .txt 和 .md 文件')`
- 文件读取失败 → `message.error('文件读取失败')`
- 网络错误 → `message.error('上传失败，请重试')`

## 组件设计

### UploadNoteModal

**Props:** 无（文件夹列表从 `noteStore` 获取）

**Emits:** `created(noteId: number)` — 创建成功后发出

**State:**
- `show` — modal 显示状态（v-model）
- `selectedFile` — 已选择的文件
- `selectedFolderId` — 选中的文件夹 ID（null = 无文件夹）
- `uploading` — 上传中状态
- `dragOver` — 拖拽悬浮状态

**结构:**
```
n-modal
  标题: "上传笔记"
  内容:
    - 拖拽/点击上传区（虚线边框，图标 + 文字提示）
      - 拖拽悬浮时边框高亮
      - 已选文件时显示文件信息（名称、大小）+ 更换按钮
    - 文件夹下拉框（n-select）
  底部:
    - 取消按钮
    - 确认按钮（disabled：未选文件 || 上传中）
```
