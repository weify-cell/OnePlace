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
  <div :class="['group card p-4 flex items-start gap-3 hover:shadow-md transition-shadow', todo.status === 'done' ? 'opacity-60' : '']">
    <!-- Checkbox -->
    <n-checkbox
      :checked="todo.status === 'done'"
      class="mt-0.5 flex-shrink-0"
      @update:checked="toggleStatus"
    />

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <div class="flex-between gap-2">
        <span :class="['font-medium text-gray-900 dark:text-white', todo.status === 'done' ? 'line-through text-gray-400' : '']">
          {{ todo.title }}
        </span>
        <div class="flex items-center gap-2 flex-shrink-0">
          <n-tag v-if="todo.type" size="tiny">
            {{ TODO_TYPE_ICONS[todo.type as keyof typeof TODO_TYPE_ICONS] }} {{ TODO_TYPE_LABELS[todo.type as keyof typeof TODO_TYPE_LABELS] }}
          </n-tag>
          <n-tag :type="TODO_PRIORITY_COLORS[todo.priority] as 'info' | 'warning' | 'error' | 'default'" size="tiny">
            {{ TODO_PRIORITY_LABELS[todo.priority] }}
          </n-tag>
        </div>
      </div>

      <p v-if="todo.description" class="text-sm text-gray-500 mt-1 truncate">{{ todo.description }}</p>

      <div class="flex items-center gap-2 mt-2 flex-wrap">
        <n-tag v-for="tag in todo.tags" :key="tag" size="tiny" type="info">{{ tag }}</n-tag>
        <span v-if="todo.due_date" class="text-xs text-gray-400">📅 {{ todo.due_date }}</span>
        <span class="text-xs text-gray-400 ml-auto">{{ TODO_STATUS_LABELS[todo.status] }}</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-1 flex-shrink-0">
      <n-button
        size="tiny"
        quaternary
        circle
        class="opacity-0 group-hover:opacity-100 transition-opacity"
        title="编辑"
        @click="openEdit"
      >✎</n-button>
      <n-button size="tiny" quaternary circle @click="confirmDelete">✕</n-button>
    </div>
  </div>

  <!-- Edit Modal -->
  <TodoEditModal
    v-model:show="showEditModal"
    :todo="todo"
  />
</template>
