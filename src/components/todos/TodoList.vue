<script setup lang="ts">
import { useTodoStore } from '@/stores/todo.store'
import TodoItem from './TodoItem.vue'
import EmptyState from '@/components/common/EmptyState.vue'

const todoStore = useTodoStore()
</script>

<template>
  <div>
    <n-spin :show="todoStore.loading">
      <div v-if="!todoStore.loading && todoStore.items.length === 0">
        <EmptyState title="暂无待办事项" description="点击右上角「新建待办」开始" />
      </div>
      <div v-else class="space-y-2">
        <TodoItem v-for="todo in todoStore.items" :key="todo.id" :todo="todo" />
      </div>
    </n-spin>
    <div v-if="todoStore.total > todoStore.pagination.pageSize" class="mt-4 flex-center">
      <n-pagination
        v-model:page="todoStore.pagination.page"
        :item-count="todoStore.total"
        :page-size="todoStore.pagination.pageSize"
        @update:page="todoStore.fetchTodos()"
      />
    </div>
  </div>
</template>
