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
  { path: '/toolbox', label: '百宝箱', icon: '🧰' },
  { path: '/settings', label: '设置', icon: '⚙️' }
]

function logout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <aside
    :class="['sidebar', collapsed ? 'sidebar--collapsed' : '']"
  >
    <!-- Logo -->
    <div class="sidebar__header">
      <div class="sidebar__logo">
        <span class="sidebar__logo-icon">📌</span>
        <span v-if="!collapsed" class="sidebar__logo-text">OnePlace</span>
      </div>
      <button
        class="sidebar__toggle"
        :title="collapsed ? '展开侧边栏' : '收起侧边栏'"
        @click="emit('toggle')"
      >
        <svg
          :class="['sidebar__toggle-icon', collapsed ? 'sidebar__toggle-icon--rotated' : '']"
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
    <nav class="sidebar__nav">
      <template v-for="item in navItems" :key="item.path">
        <router-link
          :to="item.path"
          class="sidebar__nav-item"
          :class="{ 'sidebar__nav-item--active': route.path.startsWith(item.path) }"
        >
          <span class="sidebar__nav-icon">{{ item.icon }}</span>
          <span v-if="!collapsed" class="sidebar__nav-label">{{ item.label }}</span>
          <!-- Active indicator -->
          <span v-if="route.path.startsWith(item.path)" class="sidebar__nav-dot" />
        </router-link>
      </template>
    </nav>

    <!-- Logout -->
    <div class="sidebar__footer">
      <button
        class="sidebar__logout"
        :title="collapsed ? '退出登录' : ''"
        @click="logout"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="sidebar__logout-icon"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span v-if="!collapsed" class="sidebar__logout-label">退出登录</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: 220px;
  height: 100%;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-subtle);
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.sidebar--collapsed {
  width: 64px;
}

/* Header / Logo */
.sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 0 16px;
  height: 64px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.sidebar__logo {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
}

.sidebar__logo-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.sidebar__logo-text {
  font-size: 1.0625rem;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  letter-spacing: -0.01em;
}

/* Toggle button */
.sidebar__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.sidebar__toggle:hover {
  background: var(--bg-card);
  border-color: var(--border-subtle);
  color: var(--accent-primary);
  box-shadow: var(--shadow-sm);
}

.sidebar__toggle-icon {
  width: 16px;
  height: 16px;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.sidebar__toggle-icon--rotated {
  transform: rotate(180deg);
}

/* Navigation */
.sidebar__nav {
  flex: 1;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.sidebar__nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  text-decoration: none;
  color: var(--text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  transition: all 0.15s ease;
  overflow: hidden;
}

.sidebar__nav-item:hover {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

.sidebar__nav-item--active {
  background: var(--bg-card);
  color: var(--accent-primary);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-subtle);
}

.sidebar__nav-icon {
  font-size: 1.125rem;
  flex-shrink: 0;
  width: 24px;
  text-align: center;
}

.sidebar__nav-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.sidebar__nav-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-primary);
  flex-shrink: 0;
}

/* Footer */
.sidebar__footer {
  padding: 12px 8px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.sidebar__logout {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  overflow: hidden;
}

.sidebar__logout:hover {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.sidebar__logout-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.sidebar__logout-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
