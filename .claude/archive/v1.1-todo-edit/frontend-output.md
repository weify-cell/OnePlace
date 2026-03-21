# 前端交接输出 — 待办事项编辑功能

- 迭代：v1.1
- 模块：todo-edit
- 日期：2026-03-21

---

## 已完成

- 新建 `src/components/todos/TodoEditModal.vue`
  - props: `show: boolean`, `todo: Todo`
  - emits: `update:show`, `saved`
  - watch todo prop（immediate: true）初始化 form 七字段
  - title 空校验、updateTodo 乐观更新、fetchAllTags、catch 后 fetchTodos
  - UI 风格与 TodoCreateModal 一致

- 修改 `src/components/todos/TodoItem.vue`
  - 容器加 `group` class，悬停时编辑按钮 opacity-0 → opacity-100
  - 点击编辑按钮打开 TodoEditModal（showEditModal 本地 ref）
  - 引入 TodoEditModal 组件

## 未做（本期不做）

- 标题行内编辑（P1）
- 键盘快捷键 E/Esc（P2）
