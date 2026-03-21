# 架构师交接输出 — 待办事项编辑功能

- 迭代：v1.1
- 模块：todo-edit
- 日期：2026-03-21

---

## 现有接口评估

后端路由已注册 `PATCH /:id`（todos.routes.ts 第 10 行），对应 `updateTodo` controller。
`todos.service.ts` 的 `updateTodo()` 支持所有目标字段（title / description / priority / status / type / due_date / tags）的部分更新（undefined 字段跳过），**无需新增或修改后端接口**。

Store 的 `updateTodo()` 已实现乐观更新：原地替换 `items[idx]`，**无需改造**。

---

## API 接口契约

### PATCH /api/todos/:id（现有，无需变更）

描述：部分更新待办事项，仅传入需修改的字段

Request Body（所有字段可选）：
```
{
  title?:       string
  description?: string | null
  priority?:    'low' | 'medium' | 'high' | 'urgent'
  status?:      'todo' | 'in_progress' | 'done' | 'cancelled'
  type?:        string | null
  due_date?:    string | null   // yyyy-MM-dd
  tags?:        string[]
}
```

Response 200：Todo 完整对象

---

## TodoEditModal 组件接口定义

文件路径：`src/components/todos/TodoEditModal.vue`

Props: `show: boolean`, `todo: Todo`
Emits: `update:show`, `saved`

---

## 关键约束

- `fetchAllTags()` 在 `updateTodo` 成功后调用（try 块内，非 finally）。
- updateTodo catch 后必须调用 `fetchTodos()` 重新同步，避免乐观更新数据残留。
- TodoEditModal 与 TodoCreateModal 保持独立，不共享组件。
