<script setup lang="ts">
import { useTodoStore } from '@/stores/todo.store'
import type { TodoTabName } from '@/stores/todo.store'

const todoStore = useTodoStore()

const tabs: { name: TodoTabName; label: string }[] = [
  { name: 'all', label: '全部' },
  { name: 'todo', label: '待办' },
  { name: 'in_progress', label: '进行中' },
  { name: 'done', label: '已完成' },
  { name: 'cancelled', label: '已取消' }
]
</script>

<template>
  <NTabs v-model:value="todoStore.activeTab" @update:value="todoStore.setActiveTab">
    <NTabPane
      v-for="tab in tabs"
      :key="tab.name"
      :name="tab.name"
      :tab="tab.label"
    >
      <template #suffix>
        <NBadge
          v-if="tab.name === 'all'"
          :value="todoStore.counts.all"
          :show="todoStore.counts.all > 0"
        />
        <NBadge
          v-else-if="tab.name === 'todo'"
          :value="todoStore.counts.todo"
          :show="todoStore.counts.todo > 0"
        />
        <NBadge
          v-else-if="tab.name === 'in_progress'"
          :value="todoStore.counts.in_progress"
          :show="todoStore.counts.in_progress > 0"
        />
        <NBadge
          v-else-if="tab.name === 'done'"
          :value="todoStore.counts.done"
          :show="todoStore.counts.done > 0"
        />
        <NBadge
          v-else-if="tab.name === 'cancelled'"
          :value="todoStore.counts.cancelled"
          :show="todoStore.counts.cancelled > 0"
        />
      </template>
    </NTabPane>
  </NTabs>
</template>
