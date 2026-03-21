<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useTodoStore } from '@/stores/todo.store'
import AppLayout from '@/components/common/AppLayout.vue'
import TodoFilters from '@/components/todos/TodoFilters.vue'
import TodoList from '@/components/todos/TodoList.vue'
import TodoCreateModal from '@/components/todos/TodoCreateModal.vue'

const todoStore = useTodoStore()
const showCreateModal = ref(false)

onMounted(() => {
  todoStore.fetchTodos()
  todoStore.fetchAllTags()
})
</script>

<template>
  <AppLayout>
    <div class="p-6 max-w-4xl mx-auto">
      <!-- Header -->
      <div class="flex-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">待办事项</h1>
          <p class="text-sm text-gray-500 mt-1">共 {{ todoStore.total }} 项</p>
        </div>
        <n-button type="primary" @click="showCreateModal = true">+ 新建待办</n-button>
      </div>

      <!-- Filters -->
      <TodoFilters class="mb-4" />

      <!-- List -->
      <TodoList />

      <!-- Create Modal -->
      <TodoCreateModal v-model:show="showCreateModal" />
    </div>
  </AppLayout>
</template>
