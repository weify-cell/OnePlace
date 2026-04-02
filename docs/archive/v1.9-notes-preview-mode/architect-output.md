# Architect Handoff → Frontend Agent

## 迭代信息
- 版本号: v1.9
- 模块名: notes-preview-mode
- 架构文档: docs/prd/notes-preview-mode-architecture.md

---

## 一、核心改动

### 1. NoteDetailView.vue — 预览/编辑双模式

**新增状态:**
```ts
const isEditing = ref(false)
const hasUnsavedChanges = ref(false)
```

**模式判断逻辑:**
- 预览模式 (`!isEditing`): 显示 MarkdownPreview，无编辑器
- 编辑模式 (`isEditing`): 显示 CodeMirrorMarkdownEditor

**工具栏按钮组:**

预览模式:
- Edit 按钮 (primary)
- Return-to-list 按钮

编辑模式:
- Done Editing 按钮 (primary)
- Cancel Editing 按钮 (default)
- Return-to-list 按钮

**取消编辑确认:**
```ts
function handleCancelEdit() {
  if (hasUnsavedChanges.value) {
    dialog.warning({
      title: '放弃更改',
      content: '有未保存的更改，确定要放弃吗？',
      positiveText: '放弃',
      negativeText: '继续编辑',
      onPositiveClick: () => { isEditing.value = false }
    })
  } else {
    isEditing.value = false
  }
}
```

**脏状态追踪:**
- `onContentChange` 中对比 `content !== note.content` 时设置 `hasUnsavedChanges = true`
- 完成编辑成功后重置为 false

**标题点击行为:**
- 预览模式下点击标题进入编辑模式
- 编辑模式下标题已是 input，无需额外处理

### 2. NotesView.vue — 卡片/列表切换

**新增状态:**
```ts
const viewMode = ref(localStorage.getItem('notes_view_mode') ?? 'card')
```

**切换函数:**
```ts
function toggleViewMode() {
  viewMode.value = viewMode.value === 'card' ? 'list' : 'card'
  localStorage.setItem('notes_view_mode', viewMode.value)
}
```

**视图条件渲染:**
```html
<div :class="viewMode === 'card' ? 'notes-grid' : 'notes-list'">
  <NoteCard v-for="note in noteStore.items" :key="note.id" :note="note" />
</div>
```

**列表模式样式 (.notes-list):**
```css
.notes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.notes-list .note-card {
  flex-direction: row;
  align-items: center;
}
```

---

## 二、文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/views/NoteDetailView.vue` | 修改 | 模式状态、工具栏、脏追踪 |
| `src/views/NotesView.vue` | 修改 | 视图切换、列表样式 |
| `docs/prd/notes-preview-mode-architecture.md` | 新增 | 完整架构文档 |

---

## 三、前端需读取的文档

- `docs/prd/notes-preview-mode-architecture.md`
- `src/views/NoteDetailView.vue` (现有实现)
- `src/views/NotesView.vue` (现有实现)

---

## 四、注意事项

- 本次无后端改动
- CodeMirrorMarkdownEditor 保持 split view 不变
- 笔记列表偏好通过 localStorage 持久化，key 为 `notes_view_mode`
- 存量 Tiptap 笔记迁移流程保持不变
