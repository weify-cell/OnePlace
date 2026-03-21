<script setup lang="ts">
import { useTodoStore } from '@/stores/todo.store'
import { TODO_STATUS_LABELS, TODO_PRIORITY_LABELS, TODO_TYPE_LABELS } from '@/types'

const todoStore = useTodoStore()

const statusOptions = [
  { label: '全部状态', value: null },
  ...Object.entries(TODO_STATUS_LABELS).map(([value, label]) => ({ label, value }))
]
const priorityOptions = [
  { label: '全部优先级', value: null },
  ...Object.entries(TODO_PRIORITY_LABELS).map(([value, label]) => ({ label, value }))
]
const typeOptions = [
  { label: '全部类型', value: null },
  ...Object.entries(TODO_TYPE_LABELS).map(([value, label]) => ({ label, value }))
]
</script>

<template>
  <div class="flex flex-wrap gap-3 items-center">
    <n-input
      :value="todoStore.filters.search"
      placeholder="搜索待办..."
      clearable
      class="w-48"
      @update:value="todoStore.setFilter('search', $event)"
    />
    <n-select
      :value="todoStore.filters.status"
      :options="statusOptions"
      class="w-36"
      @update:value="todoStore.setFilter('status', $event)"
    />
    <n-select
      :value="todoStore.filters.priority"
      :options="priorityOptions"
      class="w-36"
      @update:value="todoStore.setFilter('priority', $event)"
    />
    <n-select
      :value="todoStore.filters.type"
      :options="typeOptions"
      class="w-36"
      @update:value="todoStore.setFilter('type', $event)"
    />
    <n-button
      v-if="todoStore.filters.status || todoStore.filters.priority || todoStore.filters.type || todoStore.filters.search"
      size="small"
      @click="() => { todoStore.setFilter('status', null); todoStore.setFilter('priority', null); todoStore.setFilter('type', null); todoStore.setFilter('search', '') }"
    >
      清除筛选
    </n-button>
  </div>
</template>
