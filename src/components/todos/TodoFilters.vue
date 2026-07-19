<script setup lang="ts">
import { useTodoStore } from '@/stores/todo.store'
import { TODO_PRIORITY_LABELS, TODO_TASK_KIND_LABELS, TODO_TYPE_LABELS } from '@/types'

const todoStore = useTodoStore()

const priorityOptions = [
  { label: '全部优先级', value: null },
  ...Object.entries(TODO_PRIORITY_LABELS).map(([value, label]) => ({ label, value }))
]

const taskKindOptions = [
  { label: '全部任务性质', value: null },
  ...Object.entries(TODO_TASK_KIND_LABELS).map(([value, label]) => ({ label, value }))
]

const typeOptions = [
  { label: '全部类型', value: null },
  ...Object.entries(TODO_TYPE_LABELS).map(([value, label]) => ({ label, value }))
]

const hasFilters = computed(() =>
  todoStore.filters.priority ||
  todoStore.filters.task_kind ||
  todoStore.filters.type ||
  todoStore.filters.search
)
</script>

<template>
  <div class="todo-filters">
    <div class="todo-filters__search">
      <n-input
        :value="todoStore.filters.search"
        placeholder="搜索待办事项"
        clearable
        @update:value="todoStore.setFilter('search', $event)"
      >
        <template #prefix>
          <span class="todo-filters__search-icon">🔍</span>
        </template>
      </n-input>
    </div>

    <n-select
      :value="todoStore.filters.task_kind"
      :options="taskKindOptions"
      placeholder="任务性质"
      clearable
      class="todo-filters__select"
      @update:value="todoStore.setFilter('task_kind', $event)"
    />

    <n-select
      :value="todoStore.filters.priority"
      :options="priorityOptions"
      placeholder="优先级"
      clearable
      class="todo-filters__select"
      @update:value="todoStore.setFilter('priority', $event)"
    />

    <n-select
      :value="todoStore.filters.type"
      :options="typeOptions"
      placeholder="类型"
      clearable
      class="todo-filters__select"
      @update:value="todoStore.setFilter('type', $event)"
    />

    <n-button
      v-if="hasFilters"
      size="small"
      quaternary
      class="todo-filters__clear"
      @click="todoStore.resetFilters()"
    >
      清除筛选
    </n-button>
  </div>
</template>

<style scoped>
.todo-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
  align-items: center;
}

.todo-filters__search {
  min-width: 220px;
  flex: 1;
  max-width: 320px;
}

.todo-filters__search-icon {
  font-size: 0.875rem;
}

.todo-filters__select {
  min-width: 140px;
  max-width: 180px;
}

.todo-filters__clear {
  color: var(--accent-primary);
  font-weight: 500;
}

.todo-filters__clear:hover {
  color: var(--accent-secondary);
}
</style>
