<script setup lang="ts">
import { useTodoStore } from '@/stores/todo.store'
import type { Todo } from '@/types'
import { TODO_PRIORITY_LABELS, TODO_PRIORITY_COLORS, TODO_TYPE_LABELS, TODO_TYPE_ICONS, TODO_STATUS_LABELS } from '@/types'
import TodoEditModal from './TodoEditModal.vue'

const props = defineProps<{ todo: Todo }>()
const todoStore = useTodoStore()
const message = useMessage()
const dialog = useDialog()

const showEditModal = ref(false)

const dueDateStatus = computed(() => {
  if (!props.todo.due_date) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const due = new Date(props.todo.due_date)
  due.setHours(0, 0, 0, 0)
  const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)

  if (diffDays < 0) return { label: '已逾期', colorClass: 'due-date--overdue' }
  if (diffDays < 1) return { label: '今日到期', colorClass: 'due-date--urgent' }
  if (diffDays < 4) return { label: '即将到期', colorClass: 'due-date--warning' }
  return null
})

async function toggleStatus() {
  await todoStore.toggleStatus(props.todo.id)
}

function openEdit() {
  showEditModal.value = true
}

function confirmDelete() {
  dialog.warning({
    title: '删除待办',
    content: `确定删除「${props.todo.title}」？`,
    positiveText: '删除',
    onPositiveClick: async () => {
      await todoStore.deleteTodo(props.todo.id)
      message.success('已删除')
    }
  })
}
</script>

<template>
  <div
    :class="[
      'todo-item animate-fadeIn',
      todo.status === 'done' ? 'todo-item--done' : ''
    ]"
  >
    <!-- Checkbox -->
    <div class="todo-item__check" @click="toggleStatus">
      <div :class="['todo-item__checkbox', todo.status === 'done' && 'todo-item__checkbox--checked']">
        <svg v-if="todo.status === 'done'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="todo-item__check-icon">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
    </div>

    <!-- Content -->
    <div class="todo-item__content">
      <div class="todo-item__header">
        <span :class="['todo-item__title', todo.status === 'done' && 'todo-item__title--done']">
          {{ todo.title }}
        </span>
        <div class="todo-item__tags">
          <span v-if="todo.type" class="todo-item__type-tag">
            {{ TODO_TYPE_ICONS[todo.type as keyof typeof TODO_TYPE_ICONS] }} {{ TODO_TYPE_LABELS[todo.type as keyof typeof TODO_TYPE_LABELS] }}
          </span>
          <span
            :class="['todo-item__priority-tag', `todo-item__priority-tag--${todo.priority}`]"
          >
            {{ TODO_PRIORITY_LABELS[todo.priority] }}
          </span>
        </div>
      </div>

      <p v-if="todo.description" class="todo-item__desc">{{ todo.description }}</p>

      <div class="todo-item__footer">
        <div class="todo-item__meta">
          <span
            v-if="dueDateStatus"
            :class="['todo-item__due', dueDateStatus.colorClass]"
          >
            📅 {{ dueDateStatus.label }}
          </span>
          <span v-else-if="todo.due_date" class="todo-item__due todo-item__due--normal">
            📅 {{ todo.due_date }}
          </span>
          <span
            v-for="tag in todo.tags"
            :key="tag"
            class="todo-item__tag"
          >
            {{ tag }}
          </span>
        </div>
        <span class="todo-item__status">{{ TODO_STATUS_LABELS[todo.status] }}</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="todo-item__actions">
      <button class="todo-item__action" title="编辑" @click="openEdit">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="todo-item__action-icon">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="todo-item__action todo-item__action--danger" title="删除" @click="confirmDelete">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="todo-item__action-icon">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/>
        </svg>
      </button>
    </div>

    <!-- Edit Modal -->
    <TodoEditModal
      v-model:show="showEditModal"
      :todo="todo"
    />
  </div>
</template>

<style scoped>
.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: all 0.2s ease;
}

.todo-item:hover {
  box-shadow: var(--shadow-md);
  border-color: rgba(251, 191, 36, 0.35);
}

.todo-item--done {
  opacity: 0.6;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-out forwards;
  opacity: 0;
}

/* Checkbox */
.todo-item__check {
  flex-shrink: 0;
  padding-top: 2px;
  cursor: pointer;
}

.todo-item__checkbox {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  border: 2px solid var(--border-card);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  background: transparent;
}

.todo-item__checkbox:hover {
  border-color: var(--accent-primary);
}

.todo-item__checkbox--checked {
  background: var(--accent-gradient);
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(245, 158, 11, 0.3);
}

.todo-item__check-icon {
  width: 12px;
  height: 12px;
  color: white;
}

/* Content */
.todo-item__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.todo-item__header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.todo-item__title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
  min-width: 0;
}

.todo-item__title--done {
  text-decoration: line-through;
  color: var(--text-muted);
}

.todo-item__tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.todo-item__type-tag {
  font-size: 0.6875rem;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-weight: 500;
}

.todo-item__priority-tag {
  font-size: 0.6875rem;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-weight: 600;
}

.todo-item__priority-tag--low {
  background: rgba(37, 99, 235, 0.1);
  color: #2563eb;
}

.todo-item__priority-tag--medium {
  background: rgba(245, 158, 11, 0.1);
  color: var(--accent-primary);
}

.todo-item__priority-tag--high {
  background: rgba(234, 88, 12, 0.1);
  color: var(--accent-secondary);
}

.todo-item__priority-tag--urgent {
  background: rgba(220, 38, 38, 0.1);
  color: #dc2626;
}

.dark .todo-item__priority-tag--low {
  background: rgba(37, 99, 235, 0.2);
  color: #60a5fa;
}

.dark .todo-item__priority-tag--medium {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}

.dark .todo-item__priority-tag--high {
  background: rgba(251, 146, 60, 0.2);
  color: #fb923c;
}

.dark .todo-item__priority-tag--urgent {
  background: rgba(248, 113, 113, 0.2);
  color: #f87171;
}

.todo-item__desc {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
}

.todo-item__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.todo-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.todo-item__due {
  font-size: 0.75rem;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-weight: 500;
}

.todo-item__due--normal {
  color: var(--text-muted);
}

.due-date--overdue {
  background: rgba(220, 38, 38, 0.1);
  color: #dc2626;
}

.due-date--urgent {
  background: rgba(220, 38, 38, 0.1);
  color: #dc2626;
}

.due-date--warning {
  background: rgba(251, 191, 36, 0.1);
  color: var(--warning);
}

.dark .due-date--overdue {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}

.dark .due-date--urgent {
  background: rgba(248, 113, 113, 0.15);
  color: #f87171;
}

.dark .due-date--warning {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.todo-item__tag {
  font-size: 0.6875rem;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: rgba(99, 102, 241, 0.08);
  color: #6366f1;
}

.dark .todo-item__tag {
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
}

.todo-item__status {
  font-size: 0.75rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

/* Actions */
.todo-item__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.todo-item:hover .todo-item__actions {
  opacity: 1;
}

.todo-item__action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.todo-item__action:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.todo-item__action--danger:hover {
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
}

.todo-item__action-icon {
  width: 14px;
  height: 14px;
}
</style>
