# 前端开发输出 - Todo 模块状态Tab重构 v1.10

## 迭代信息

| 字段 | 值 |
|------|-----|
| 版本号 | v1.10 |
| 模块标识 | todo-status-tabs |
| 迭代目标 | 待办页面顶部新增 5 个状态 Tab，支持角标显示各状态数量 |
| 完成日期 | 2026-04-02 |

---

## 已完成工作

### 1. todo.store.ts - 新增状态筛选和计数管理

**文件**: `src/stores/todo.store.ts`

#### 新增类型
```typescript
export type TodoTabName = 'all' | 'todo' | 'in_progress' | 'done' | 'cancelled'

export interface TodoCounts {
  all: number
  todo: number
  in_progress: number
  done: number
  cancelled: number
}
```

#### 新增状态
```typescript
const counts = ref<TodoCounts>({ all: 0, todo: 0, in_progress: 0, done: 0, cancelled: 0 })
const activeTab = ref<TodoTabName>('all')
```

#### 新增方法

| 方法 | 说明 |
|------|------|
| `fetchTodoCounts()` | 调用 `GET /api/todos/counts` 获取各状态数量 |
| `fetchPendingCount()` | 调用 `GET /api/todos/pending-count` 获取待办数量（用于登录弹窗） |
| `setActiveTab(tab)` | 切换 Tab 时调用，设置 filter.status 并重新 fetchTodos 和 fetchTodoCounts |

---

### 2. todos.api.ts - 新增 API 方法

**文件**: `src/api/todos.api.ts`

```typescript
getCounts: () => api.get<TodoCounts>('/todos/counts'),
getPendingCount: () => api.get<{ count: number }>('/todos/pending-count')
```

---

### 3. TodoTabs.vue - 新增 Tab 标签组件

**文件**: `src/components/todos/TodoTabs.vue`

- 5 个 Tab：全部 / 待办 / 进行中 / 已完成 / 已取消
- 每个 Tab 右侧显示 NBadge 角标（仅数量 > 0 时显示）
- Tab 切换调用 `todoStore.setActiveTab()`

---

### 4. TodosView.vue - 集成 TodoTabs

**文件**: `src/views/TodosView.vue`

- 引入 TodoTabs 组件
- 在 TodoFilters 上方渲染 TodoTabs
- `onMounted` 中增加 `todoStore.fetchTodoCounts()` 调用

---

### 5. TodoFilters.vue - 移除状态筛选

**文件**: `src/components/todos/TodoFilters.vue`

- 移除 `status` 筛选项（由 TodoTabs 替代）
- 保留 `priority`、`type`、`search` 筛选项
- 清除按钮逻辑同步更新

---

### 6. LoginReminderModal.vue - 新增登录弹窗组件

**文件**: `src/components/common/LoginReminderModal.vue`

#### 功能逻辑
1. `onMounted` 时检查 `localStorage` 的 `todo_reminder_date`
2. 若当天未提醒，调用 `GET /api/todos/pending-count`
3. 若 `pendingCount > 0`，显示弹窗
4. 用户勾选「今天不再提醒」后，写入 `todo_reminder_date` 到 localStorage
5. 点击「查看待办」跳转到 `/todos`

#### localStorage Key
- `todo_reminder_date`: `YYYY-MM-DD` 格式

---

### 7. App.vue - 集成登录弹窗

**文件**: `src/App.vue`

- 引入 LoginReminderModal
- 新增 `showReminderModal` computed 属性：仅在已登录且非登录/设置页面时为 true
- 在 `<router-view />` 下方条件渲染 LoginReminderModal

---

## 文件清单

| 文件 | 变更类型 |
|------|---------|
| `src/stores/todo.store.ts` | 修改 |
| `src/api/todos.api.ts` | 修改 |
| `src/components/todos/TodoTabs.vue` | 新增 |
| `src/views/TodosView.vue` | 修改 |
| `src/components/todos/TodoFilters.vue` | 修改 |
| `src/components/common/LoginReminderModal.vue` | 新增 |
| `src/App.vue` | 修改 |

---

## 待验证

- [ ] 待办页面顶部显示 5 个 Tab（全部/待办/进行中/已完成/已取消）
- [ ] Tab 切换时筛选对应状态的任务
- [ ] 各 Tab 右侧显示正确的数量角标
- [ ] 状态变更后 Tab 角标数量同步更新
- [ ] 登录后（非登录/设置页面）弹出待办提醒弹窗
- [ ] 勾选「今天不再提醒」后，当天不再弹出
- [ ] 点击「查看待办」跳转到待办页面
- [ ] 类型检查通过 (`npm run typecheck`)
- [ ] 构建成功 (`npm run build`)

---

## 注意事项

- Tab 角标数量需要在 `TodosView.onMounted` 和每次状态变更后刷新
- `LoginReminderModal` 仅在已认证用户访问业务页面时显示
- `pendingCount` 接口返回的 count 字段位于 response.data（API 响应包装）

---

## 上一迭代

- v1.9 | 笔记模块 - 预览/编辑双模式 | 2026-04-02 | docs/archive/v1.9-notes-preview-mode/
