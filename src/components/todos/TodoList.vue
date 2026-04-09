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
        <EmptyState
          title="暂无待办事项"
          description="点击右上角「新建待办」开始"
          icon="📋"
        />
      </div>
      <div v-else class="todo-list">
        <TodoItem
          v-for="(todo, index) in todoStore.items"
          :key="todo.id"
          :todo="todo"
          :style="{ animationDelay: `${index * 30}ms` }"
        />
      </div>
    </n-spin>
    <div
      v-if="todoStore.total > todoStore.pagination.pageSize"
      class="todo-pagination"
    >
      <n-pagination
        v-model:page="todoStore.pagination.page"
        :item-count="todoStore.total"
        :page-size="todoStore.pagination.pageSize"
        @update:page="todoStore.fetchTodos()"
      />
    </div>
  </div>
</template>

<style scoped>
.todo-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.todo-pagination {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}
</style>
