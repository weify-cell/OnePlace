# Todo 模块状态Tab重构 - 技术方案

## 1. 数据库变更

### 1.1 迁移文件

**文件**: `server/src/database/migrations/006_todos_completed_at.sql`

```sql
-- v1.10 todo-status-tabs
-- 新增 completed_at 字段记录任务完成时间
ALTER TABLE todos ADD COLUMN completed_at DATETIME DEFAULT NULL;
```

### 1.2 Schema 变更

`todos` 表新增字段：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `completed_at` | DATETIME | NULL | 完成时间戳，NULL 表示未完成 |

### 1.3 业务规则

- 状态变更为 `done` 时：自动设置 `completed_at = 当前时间戳`
- 状态从 `done` 变更为其他状态时：清除 `completed_at`（设为 NULL）
- 其他字段变更时不影响 `completed_at`

---

## 2. 后端 API 设计

### 2.1 GET `/api/todos`

**描述**: 获取任务列表，支持状态筛选和排序

**Query Parameters**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `status` | string | - | 筛选状态：`todo` / `in_progress` / `done` / `cancelled` |
| `priority` | string | - | 筛选优先级 |
| `type` | string | - | 筛选类型 |
| `tag` | string | - | 筛选标签 |
| `search` | string | - | 搜索标题/描述 |
| `page` | number | 1 | 页码 |
| `pageSize` | number | 20 | 每页数量 |
| `sortBy` | string | `due_date` | 排序字段 |
| `sortOrder` | string | `asc` | 排序方向：`asc` / `desc` |

**注意**: 当 `status` 为 `done` 时，`sortBy` 强制为 `completed_at`，`sortOrder` 强制为 `desc`；其他状态时 `sortBy` 强制为 `due_date`。

**Response**:
```json
{
  "items": [
    {
      "id": 1,
      "title": "完成任务",
      "description": null,
      "priority": "medium",
      "status": "todo",
      "type": null,
      "due_date": "2026-04-10T00:00:00.000Z",
      "tags": ["工作"],
      "is_deleted": false,
      "completed_at": null,
      "created_at": "2026-04-01T10:00:00.000Z",
      "updated_at": "2026-04-01T10:00:00.000Z"
    }
  ],
  "total": 50,
  "page": 1,
  "pageSize": 20
}
```

### 2.2 GET `/api/todos/counts`

**描述**: 获取各状态的任务数量（用于 Tab 角标）

**Response**:
```json
{
  "all": 50,
  "todo": 20,
  "in_progress": 15,
  "done": 10,
  "cancelled": 5
}
```

### 2.3 PATCH `/api/todos/:id`

**描述**: 更新任务，状态变更时自动处理 `completed_at`

**Request Body**:
```json
{
  "status": "done"
}
```

**Response**: 返回更新后的完整任务对象

**业务逻辑**:
- `status` 变为 `done` 时，设置 `completed_at = 当前时间戳`
- `status` 从 `done` 变为其他值时，清除 `completed_at`

### 2.4 GET `/api/todos/pending-count`

**描述**: 获取待办事项数量（用于登录弹窗提醒）

**Response**:
```json
{
  "count": 5
}
```

**条件**: 统计 `status = 'todo'` 且 `is_deleted = 0` 的记录数

---

## 3. 前端组件结构

### 3.1 Todo 页面组件结构

```
src/views/TodoView.vue
├── TodoHeader.vue          # 搜索栏 + 新建按钮
├── TodoTabs.vue             # Tab 标签组件（新增）
│   ├── NTabs
│   ├── NTabPane (全部)
│   ├── NTabPane (待办) + NBadge
│   ├── NTabPane (进行中) + NBadge
│   ├── NTabPane (已完成) + NBadge
│   └── NTabPane (已取消) + NBadge
├── TodoFilters.vue          # 现有筛选栏（保留）
└── TodoList.vue             # 任务列表
    └── TodoItem.vue
```

### 3.2 Tab 组件实现

```vue
<!-- TodoTabs.vue -->
<template>
  <NTabs v-model:value="activeTab" @update:value="handleTabChange">
    <NTabPane name="all" tab="全部">
      <template #suffix><NBadge :value="counts.all" :show="counts.all > 0" /></template>
    </NTabPane>
    <NTabPane name="todo" tab="待办">
      <template #suffix><NBadge :value="counts.todo" :show="counts.todo > 0" /></template>
    </NTabPane>
    <NTabPane name="in_progress" tab="进行中">
      <template #suffix><NBadge :value="counts.in_progress" :show="counts.in_progress > 0" /></template>
    </NTabPane>
    <NTabPane name="done" tab="已完成">
      <template #suffix><NBadge :value="counts.done" :show="counts.done > 0" /></template>
    </NTabPane>
    <NTabPane name="cancelled" tab="已取消">
      <template #suffix><NBadge :value="counts.cancelled" :show="counts.cancelled > 0" /></template>
    </NTabPane>
  </NTabs>
</template>
```

### 3.3 登录弹窗组件

**组件**: `src/components/LoginReminderModal.vue`

```vue
<!-- LoginReminderModal.vue -->
<template>
  <NModal v-model:show="showModal" :mask-closable="false">
    <NCard title="待办提醒" style="width: 400px;">
      <p>你有 <strong>{{ pendingCount }}</strong> 项待办事项</p>
      <NCheckbox v-model:checked="dontRemindToday" style="margin-top: 12px;">
        今天不再提醒
      </NCheckbox>
      <template #footer>
        <div style="display: flex; justify-content: space-between;">
          <NButton @click="handleClose">关闭</NButton>
          <NButton type="primary" @click="handleViewTodo">查看待办</NButton>
        </div>
      </template>
    </NCard>
  </NModal>
</template>
```

**逻辑**:
1. 组件 `mounted` 时调用 `GET /api/todos/pending-count`
2. 检查 `localStorage` 是否已有 `todo_reminder_date`（格式：`YYYY-MM-DD`）
3. 若当天未提醒且 `pendingCount > 0`，显示弹窗
4. 用户勾选"今天不再提醒"时，写入 `localStorage.setItem('todo_reminder_date', today)`
5. 关闭弹窗或跳转后不再显示，直到次日

---

## 4. 关键实现细节

### 4.1 状态变更时 completed_at 处理

在 `server/src/services/todos.service.ts` 的 `updateTodo` 函数中：

```typescript
if (data.status !== undefined) {
  updates.push('status = ?')
  params.push(data.status)

  if (data.status === 'done') {
    updates.push("completed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
  } else {
    updates.push('completed_at = NULL')
  }
}
```

### 4.2 排序逻辑

在 `server/src/services/todos.service.ts` 的 `getTodos` 函数中：

```typescript
// 根据状态决定排序规则
let validSort = sortBy
let order = sortOrder === 'asc' ? 'ASC' : 'DESC'

if (status === 'done') {
  // 已完成按完成时间降序
  validSort = 'completed_at'
  order = 'DESC'
} else if (['todo', 'in_progress', 'cancelled', 'all'].includes(status || '')) {
  // 其他状态按截止日期升序，NULL 排最后
  validSort = 'due_date'
  order = 'ASC'
} else {
  validSort = 'due_date'
  order = 'ASC'
}
```

**NULL 排最后的处理**（SQLite）：
```sql
ORDER BY
  CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
  t.due_date ASC
```

### 4.3 Tab 角标数量获取

新增 `getTodoCounts()` 服务函数：

```typescript
export function getTodoCounts() {
  const db = connectDatabase()
  const counts = {
    all: (db.prepare('SELECT COUNT(*) as count FROM todos WHERE is_deleted = 0').get() as { count: number }).count,
    todo: (db.prepare("SELECT COUNT(*) as count FROM todos WHERE is_deleted = 0 AND status = 'todo'").get() as { count: number }).count,
    in_progress: (db.prepare("SELECT COUNT(*) as count FROM todos WHERE is_deleted = 0 AND status = 'in_progress'").get() as { count: number }).count,
    done: (db.prepare("SELECT COUNT(*) as count FROM todos WHERE is_deleted = 0 AND status = 'done'").get() as { count: number }).count,
    cancelled: (db.prepare("SELECT COUNT(*) as count FROM todos WHERE is_deleted = 0 AND status = 'cancelled'").get() as { count: number }).count,
  }
  return counts
}
```

### 4.4 登录弹窗触发逻辑

在 `src/views/HomeView.vue` 或 `App.vue` 的 `onMounted` 中：

```typescript
const showReminder = ref(false)
const pendingCount = ref(0)
const dontRemindToday = ref(false)

const today = new Date().toISOString().split('T')[0]
const lastReminder = localStorage.getItem('todo_reminder_date')

if (lastReminder !== today) {
  const { count } = await todoStore.fetchPendingCount()
  if (count > 0) {
    pendingCount.value = count
    showReminder.value = true
  }
}

const handleClose = () => {
  if (dontRemindToday.value) {
    localStorage.setItem('todo_reminder_date', today)
  }
  showReminder.value = false
}
```

### 4.5 localStorage 存储结构

| Key | 值 | 说明 |
|-----|-----|------|
| `todo_reminder_date` | `YYYY-MM-DD` | 最近一次点击"今天不再提醒"的日期 |

---

## 5. 文件清单

### 后端需修改/新增

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/src/database/migrations/006_todos_completed_at.sql` | 新增 | completed_at 字段迁移 |
| `server/src/services/todos.service.ts` | 修改 | 排序逻辑、completed_at 处理、新增 getTodoCounts |
| `server/src/controllers/todos.controller.ts` | 修改 | 新增 counts 和 pending-count 端点 |
| `server/src/routes/todos.routes.ts` | 修改 | 新增路由 |

### 前端需修改/新增

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/LoginReminderModal.vue` | 新增 | 登录弹窗组件 |
| `src/views/TodoView.vue` | 修改 | 集成 TodoTabs |
| `src/components/TodoTabs.vue` | 新增 | Tab 标签组件 |
| `src/stores/todo.store.ts` | 修改 | 新增 fetchCounts、fetchPendingCount |
| `src/views/HomeView.vue` | 修改 | 登录弹窗触发逻辑 |

---

## 6. 依赖关系

```
PM Output (docs/prd/todo-status-tabs-redesign.md)
         │
         ▼
  Architect Output (本文档)
         │
    ┌────┴────┐
    ▼         ▼
 Backend   Frontend
 Agent     Agent
```

**后端需读取**:
- `docs/prd/todo-status-tabs-architecture.md`（本文档）
- `server/src/services/todos.service.ts`（现有代码）

**前端需读取**:
- `docs/prd/todo-status-tabs-architecture.md`（本文档）
- `src/stores/todo.store.ts`（现有 store）
- `src/views/TodoView.vue`（现有页面）
