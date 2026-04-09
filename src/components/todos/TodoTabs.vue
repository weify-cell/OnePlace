<script setup lang="ts">
import { useTodoStore } from '@/stores/todo.store'
import type { TodoTabName } from '@/stores/todo.store'

const todoStore = useTodoStore()

const tabs: { name: TodoTabName; label: string; icon: string }[] = [
  { name: 'todo', label: '待办', icon: '📋' },
  { name: 'in_progress', label: '进行中', icon: '🔄' },
  { name: 'done', label: '已完成', icon: '✅' },
  { name: 'cancelled', label: '已取消', icon: '🚫' },
  { name: 'all', label: '全部', icon: '📑' }
]
</script>

<template>
  <div class="todo-tabs">
    <button
      v-for="tab in tabs"
      :key="tab.name"
      class="todo-tabs__tab"
      :class="{ 'todo-tabs__tab--active': todoStore.activeTab === tab.name }"
      @click="todoStore.setActiveTab(tab.name)"
    >
      <span class="todo-tabs__icon">{{ tab.icon }}</span>
      <span class="todo-tabs__label">{{ tab.label }}</span>
      <span
        v-if="todoStore.counts[tab.name] > 0"
        class="todo-tabs__badge"
        :class="{ 'todo-tabs__badge--active': todoStore.activeTab === tab.name }"
      >
        {{ todoStore.counts[tab.name] }}
      </span>
    </button>
  </div>
</template>

<style scoped>
.todo-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  margin-bottom: 16px;
  box-shadow: var(--shadow-sm);
}

.todo-tabs__tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  transition: all 0.15s ease;
  flex: 1;
  justify-content: center;
}

.todo-tabs__tab:hover {
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.todo-tabs__tab--active {
  background: var(--accent-gradient);
  color: white;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.35);
}

.todo-tabs__tab--active:hover {
  background: var(--accent-gradient);
}

.todo-tabs__icon {
  font-size: 0.875rem;
}

.todo-tabs__label {
  white-space: nowrap;
}

.todo-tabs__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--radius-full);
  font-size: 0.6875rem;
  font-weight: 700;
  background: var(--bg-secondary);
  color: var(--text-muted);
  transition: all 0.15s ease;
}

.todo-tabs__badge--active {
  background: rgba(255, 255, 255, 0.25);
  color: white;
}
</style>
