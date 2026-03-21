<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'

const props = defineProps<{ collapsed: boolean }>()
const emit = defineEmits<{ toggle: [] }>()

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const navItems = [
  { path: '/todos', label: '待办事项', icon: '✅' },
  { path: '/notes', label: '笔记', icon: '📝' },
  { path: '/chat', label: 'AI 对话', icon: '🤖' },
  { path: '/settings', label: '设置', icon: '⚙️' }
]

function logout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <aside
    :class="['relative flex flex-col overflow-hidden bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300', collapsed ? 'w-16' : 'w-56']"
  >
    <!-- Logo -->
    <div class="flex-between px-4 py-4 border-b border-gray-200 dark:border-gray-700 h-14">
      <span v-if="!collapsed" class="font-bold text-lg text-primary-600">OnePlace</span>
      <button
        class="toggle-btn"
        :title="collapsed ? '展开侧边栏' : '收起侧边栏'"
        @click="emit('toggle')"
      >
        <svg
          :class="['toggle-icon', collapsed ? 'rotate-180' : '']"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
      <template v-for="item in navItems" :key="item.path">
        <router-link
          :to="item.path"
          :class="[
            'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium',
            route.path.startsWith(item.path)
              ? 'bg-primary-50 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
          ]"
        >
          <span class="text-lg leading-none flex-shrink-0">{{ item.icon }}</span>
          <span :class="['whitespace-nowrap overflow-hidden transition-all duration-300', collapsed ? 'max-w-0 opacity-0' : 'max-w-xs opacity-100']">{{ item.label }}</span>
        </router-link>
      </template>
    </nav>

    <!-- Logout -->
    <div class="p-2 border-t border-gray-200 dark:border-gray-700">
      <button
        :class="['logout-btn', collapsed ? 'justify-center' : '']"
        :title="collapsed ? '退出登录' : ''"
        @click="logout"
      >
        <svg
          class="logout-icon"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span :class="['logout-label overflow-hidden transition-all duration-300', collapsed ? 'max-w-0 opacity-0' : 'max-w-xs opacity-100']">退出登录</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid transparent;
  color: #9ca3af;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  transition: color 0.15s, background-color 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.toggle-btn:hover {
  color: #4f46e5;
  background-color: #eef2ff;
  border-color: #c7d2fe;
  box-shadow: 0 1px 3px rgba(79, 70, 229, 0.12);
}

.toggle-btn:active {
  background-color: #e0e7ff;
  box-shadow: none;
}

:global(.dark) .toggle-btn {
  color: #6b7280;
}

:global(.dark) .toggle-btn:hover {
  color: #818cf8;
  background-color: #1e1b4b;
  border-color: #3730a3;
}

:global(.dark) .toggle-btn:active {
  background-color: #312e81;
}

.toggle-icon {
  width: 16px;
  height: 16px;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.toggle-icon.rotate-180 {
  transform: rotate(180deg);
}

.logout-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: #9ca3af;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s, background-color 0.15s, border-color 0.15s;
}

.logout-btn:hover {
  color: #ef4444;
  background-color: #fef2f2;
  border-color: #fecaca;
}

.logout-btn:active {
  background-color: #fee2e2;
}

:global(.dark) .logout-btn {
  color: #6b7280;
}

:global(.dark) .logout-btn:hover {
  color: #f87171;
  background-color: #3b1c1c;
  border-color: #7f1d1d;
}

:global(.dark) .logout-btn:active {
  background-color: #4c1c1c;
}

.logout-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.logout-label {
  white-space: nowrap;
}
</style>
