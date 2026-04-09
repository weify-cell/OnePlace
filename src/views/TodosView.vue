<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useTodoStore } from '@/stores/todo.store'
import AppLayout from '@/components/common/AppLayout.vue'
import TodoTabs from '@/components/todos/TodoTabs.vue'
import TodoFilters from '@/components/todos/TodoFilters.vue'
import TodoList from '@/components/todos/TodoList.vue'
import TodoCreateModal from '@/components/todos/TodoCreateModal.vue'

const todoStore = useTodoStore()
const showCreateModal = ref(false)

onMounted(() => {
  todoStore.setActiveTab(todoStore.activeTab)
  todoStore.fetchAllTags()
  todoStore.fetchTodoCounts()
})
</script>

<template>
  <AppLayout>
    <div class="todos-page">
      <!-- Background gradient -->
      <div class="todos-page__bg" />

      <!-- Content -->
      <div class="todos-page__content">
        <!-- Page header -->
        <div class="todos-header animate-slideIn">
          <div class="todos-header__text">
            <h1 class="todos-header__title">待办事项</h1>
            <p class="todos-header__sub">共 {{ todoStore.total }} 项任务</p>
          </div>
          <n-button
            type="primary"
            class="todos-header__btn"
            @click="showCreateModal = true"
          >
            <template #icon>
              <span>✨</span>
            </template>
            新建待办
          </n-button>
        </div>

        <!-- Tabs -->
        <div class="animate-slideIn" style="animation-delay: 50ms">
          <TodoTabs />
        </div>

        <!-- Filters -->
        <div class="animate-slideIn" style="animation-delay: 100ms">
          <TodoFilters />
        </div>

        <!-- List -->
        <div class="animate-slideIn" style="animation-delay: 150ms">
          <TodoList />
        </div>
      </div>

      <!-- Create Modal -->
      <TodoCreateModal v-model:show="showCreateModal" />
    </div>
  </AppLayout>
</template>

<style scoped>
.todos-page {
  min-height: 100%;
  position: relative;
  background: var(--bg-primary);
}

.todos-page__bg {
  position: absolute;
  inset: 0;
  background: var(--bg-content-gradient);
  pointer-events: none;
}

.todos-page__content {
  position: relative;
  z-index: 1;
  max-width: 900px;
  margin: 0 auto;
  padding: 32px 28px;
}

/* Header */
.todos-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.todos-header__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.todos-header__title {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.todos-header__sub {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.todos-header__btn {
  background: var(--accent-gradient) !important;
  border: none !important;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);
  font-weight: 600;
  transition: all 0.2s ease;
}

.todos-header__btn:hover {
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
  transform: translateY(-1px);
}

/* Animations */
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-slideIn {
  animation: slideIn 0.35s ease-out forwards;
}
</style>
