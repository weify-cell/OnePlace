# Architect Handoff → Backend / Frontend Agent

## 迭代信息
- 版本号: v1.10
- 模块名: todo-status-tabs
- 架构文档: docs/prd/todo-status-tabs-architecture.md

---

## 一、核心改动

### 1. 数据库变更

**文件**: `server/src/database/migrations/006_todos_completed_at.sql`

```sql
ALTER TABLE todos ADD COLUMN completed_at DATETIME DEFAULT NULL;
```

### 2. API 变更

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/todos` | GET | 新增 `status` 筛选参数 |
| `/api/todos/counts` | GET | 新增，返回各状态数量 |
| `/api/todos/pending-count` | GET | 新增，返回待办数量 |
| `/api/todos/:id` | PATCH | 状态变更时自动处理 completed_at |

### 3. 排序规则

- `status = 'done'`: `ORDER BY completed_at DESC`
- 其他状态: `ORDER BY due_date ASC, NULLS LAST`

### 4. 登录弹窗

- `LoginReminderModal.vue`: 首次登录且有待办时弹出
- localStorage key: `todo_reminder_date` (格式: YYYY-MM-DD)

---

## 二、文件清单

### 后端
| 文件 | 操作 |
|------|------|
| `server/src/database/migrations/006_todos_completed_at.sql` | 新增 |
| `server/src/services/todos.service.ts` | 修改 |
| `server/src/controllers/todos.controller.ts` | 修改 |
| `server/src/routes/todos.routes.ts` | 修改 |

### 前端
| 文件 | 操作 |
|------|------|
| `src/components/LoginReminderModal.vue` | 新增 |
| `src/components/TodoTabs.vue` | 新增 |
| `src/views/TodoView.vue` | 修改 |
| `src/stores/todo.store.ts` | 修改 |
| `src/views/HomeView.vue` | 修改 |

---

## 三、文档

- 完整架构文档: `docs/prd/todo-status-tabs-architecture.md`

---

## 四、注意事项

- completed_at 只在 status 变为 done 时自动设置
- 状态从 done 变更为其他时清除 completed_at
- 登录弹窗使用 localStorage 存储日期，不使用后端
