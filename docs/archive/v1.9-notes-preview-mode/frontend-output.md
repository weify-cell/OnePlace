# 前端开发输出 - 笔记预览/编辑模式 v1.9

## 迭代信息

| 字段 | 值 |
|------|-----|
| 版本号 | v1.9 |
| 模块标识 | notes-preview-mode |
| 迭代目标 | 笔记详情页增加预览/编辑双模式 + 笔记列表卡片/列表切换视图 |
| 完成日期 | 2026-04-01 |

---

## 已完成工作

### 1. NoteDetailView.vue - 预览/编辑双模式

**文件**: `src/views/NoteDetailView.vue`

#### 新增状态
```typescript
const isEditing = ref(false)           // 默认预览模式
const hasUnsavedChanges = ref(false)   // 追踪未保存更改
const pendingTitle = ref('')           // 编辑中的标题暂存
const pendingContent = ref('')         // 编辑中的内容暂存
```

#### 模式行为

**预览模式**（默认）:
- 只显示 `MarkdownPreview` 组件（纯阅读，无编辑器）
- 标题显示当前笔记标题，hover 时指针变为点击样式，click 进入编辑模式
- 工具栏按钮：「编辑」（主按钮）+「置顶」
- 自动保存指示器正常显示

**编辑模式**:
- 显示 `CodeMirrorMarkdownEditor`（左侧编辑 + 右侧预览分屏）
- 标题变为可编辑 input，实时同步到 `pendingTitle`
- 工具栏按钮：「完成编辑」（主按钮）+「取消编辑」
- 内容变更通过 `onContentChange` 同步到 `pendingContent`

#### 核心函数

| 函数 | 说明 |
|------|------|
| `enterEditMode()` | 初始化 `pendingTitle/pendingContent`，设置 `isEditing = true` |
| `handleDoneEdit()` | 调用 `updateNote` 保存，切换回预览模式，显示成功消息 |
| `handleCancelEdit()` | 若 `hasUnsavedChanges` 为 true，弹出确认对话框；否则直接退出编辑模式 |

#### 脏状态追踪
- `hasUnsavedChanges` 在以下情况变为 `true`：
  - `pendingTitle !== note.title`
  - `pendingContent !== note.content`
- 取消确认对话框使用 `useDialog` 的 `dialog.warning()`
- 确认「放弃」后重置 `isEditing` 和 `hasUnsavedChanges`

#### 兼容性
- 存量 Tiptap 笔记（`isLegacyNote`）保持原有迁移流程不变
- 非 Markdown 笔记（`isMarkdownNote`）不响应标题点击进入编辑

---

### 2. NotesView.vue - 卡片/列表切换

**文件**: `src/views/NotesView.vue`

#### 新增状态
```typescript
const viewMode = ref(localStorage.getItem('notes_view_mode') as 'card' | 'list' || 'card')
```

#### localStorage 持久化
- Key: `'notes_view_mode'`
- 值: `'card'` | `'list'`
- 切换时同步写入

#### 视图切换按钮
- 位于页面标题右侧，新建笔记按钮左侧
- 两个图标按钮：卡片图标 / 列表图标
- 选中状态有背景高亮和颜色变化
- 深色模式适配

#### 列表视图样式
- 紧凑单行：标题（flex: 1，左侧） + 相对时间（右侧）
- 标题截断（text-overflow: ellipsis）
- 点击整行导航到笔记详情页 `/notes/:id`
- 相对时间格式化（刚刚/X分钟前/X小时前/X天前/具体日期）

#### 卡片视图
- 原有 `notes-grid` 布局不变

---

## 文件清单

| 文件 | 变更类型 |
|------|---------|
| `src/views/NoteDetailView.vue` | 修改 |
| `src/views/NotesView.vue` | 修改 |

---

## 技术实现细节

### NoteDetailView 模式状态机
```
Page Load
    │
    ▼
[Preview Mode]
    │
    ├─ Click "编辑" ───────────────────────────┐
    │  or Click title (non-legacy note)        │
    ▼                                          │
[Edit Mode]                                     │
    │                                          │
    ├─ Click "完成编辑" ───────────────────────┤
    │   → saveNote() → isEditing = false       │
    │                                          │
    ├─ Click "取消编辑"                        │
    │   → if dirty: confirm dialog()           │
    │   → isEditing = false                  │
    │                                          │
    └─────────────────────────────────────────┘
```

### NotesView 相对时间格式化
```typescript
function formatTime(isoString: string) {
  // < 1min → 刚刚
  // < 60min → X 分钟前
  // < 24h → X 小时前
  // < 7d → X 天前
  // else → 10月20日
}
```

---

## 待验证

- [ ] 笔记详情页默认进入预览模式（MarkdownPreview）
- [ ] 点击「编辑」按钮进入编辑模式（CodeMirrorMarkdownEditor + 预览分屏）
- [ ] 点击标题进入编辑模式（非 legacy 笔记）
- [ ] 编辑模式修改内容后，「取消编辑」弹出确认框（仅在有更改时）
- [ ] 「完成编辑」保存并切换回预览模式
- [ ] 预览模式标题 hover 有颜色和指针变化
- [ ] 笔记列表右上角显示卡片/列表切换按钮
- [ ] 切换列表视图后刷新页面，视图偏好保持
- [ ] 列表视图显示标题 + 相对时间
- [ ] 列表视图点击行跳转到笔记详情页

---

## 注意事项

- 编辑模式的「完成编辑」使用同步保存（不等 debounce），立即生效
- 预览模式的标题/内容变更仍走 debouncedSave（1000ms 防抖）
- legacy Tiptap 笔记不响应标题点击进入编辑（保持只读 + 迁移流程）

---

## 上一迭代

- v1.8 | 笔记 Markdown 编辑器 | 2026-04-02 | docs/handoff/frontend-output.md
