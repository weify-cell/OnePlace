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
    :class="['flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300', collapsed ? 'w-16' : 'w-56']"
  >
    <!-- Logo -->
    <div class="flex-between px-4 py-4 border-b border-gray-200 dark:border-gray-700 h-14">
      <span v-if="!collapsed" class="font-bold text-lg text-primary-600">OnePlace</span>
      <button class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" @click="emit('toggle')">
        {{ collapsed ? '→' : '←' }}
      </button>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 py-4 space-y-1 px-2">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        :class="[
          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium',
          route.path.startsWith(item.path)
            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
        ]"
      >
        <span class="text-lg leading-none flex-shrink-0">{{ item.icon }}</span>
        <span v-if="!collapsed">{{ item.label }}</span>
      </router-link>
    </nav>

    <!-- Logout -->
    <div class="p-2 border-t border-gray-200 dark:border-gray-700">
      <button
        :class="['flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors', collapsed ? 'justify-center' : '']"
        @click="logout"
      >
        <span class="text-lg leading-none">🚪</span>
        <span v-if="!collapsed">退出登录</span>
      </button>
    </div>
  </aside>
</template>
