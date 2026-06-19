import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'

const PUBLIC_PATHS = new Set(['/login', '/setup'])

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/todos' },
    { path: '/login', component: () => import('@/views/LoginView.vue') },
    { path: '/setup', component: () => import('@/views/SetupView.vue') },
    { path: '/todos', component: () => import('@/views/TodosView.vue'), meta: { requiresAuth: true } },
    { path: '/notes', component: () => import('@/views/NotesView.vue'), meta: { requiresAuth: true } },
    { path: '/notes/:id', component: () => import('@/views/NoteDetailView.vue'), meta: { requiresAuth: true } },
    { path: '/chat', component: () => import('@/views/ChatView.vue'), meta: { requiresAuth: true } },
    { path: '/chat/:id', component: () => import('@/views/ChatView.vue'), meta: { requiresAuth: true } },
    { path: '/toolbox', component: () => import('@/views/ToolboxView.vue'), meta: { requiresAuth: true } },
    { path: '/toolbox/json', component: () => import('@/views/tools/JsonToolView.vue'), meta: { requiresAuth: true } },
    { path: '/toolbox/image-base64', component: () => import('@/views/tools/ImageBase64ToolView.vue'), meta: { requiresAuth: true } },
    { path: '/toolbox/text-diff', component: () => import('@/views/tools/TextDiffToolView.vue'), meta: { requiresAuth: true } },
    { path: '/toolbox/timestamp', component: () => import('@/views/tools/TimestampToolView.vue'), meta: { requiresAuth: true } },
    { path: '/toolbox/crontab', component: () => import('@/views/tools/CrontabToolView.vue'), meta: { requiresAuth: true } },
    { path: '/toolbox/base64-codec', component: () => import('@/views/tools/Base64CodecToolView.vue'), meta: { requiresAuth: true } },
    { path: '/toolbox/url-codec', component: () => import('@/views/tools/UrlCodecToolView.vue'), meta: { requiresAuth: true } },
    { path: '/toolbox/hash', component: () => import('@/views/tools/HashToolView.vue'), meta: { requiresAuth: true } },
    { path: '/settings', component: () => import('@/views/SettingsView.vue'), meta: { requiresAuth: true } }
  ]
})

router.beforeEach(async (to) => {
  try {
    const authStore = useAuthStore()
    const needsSetup = await authStore.checkSetup()

    if (needsSetup && to.path !== '/setup') {
      return '/setup'
    }

    if (!needsSetup && to.path === '/setup') {
      return authStore.isAuthenticated ? '/todos' : '/login'
    }

    if (to.meta.requiresAuth && !authStore.token) {
      return '/login'
    }

    if (PUBLIC_PATHS.has(to.path) && authStore.isAuthenticated && !needsSetup) {
      return '/todos'
    }

    return true
  } catch (err) {
    console.error('[router] beforeEach failed:', err)
    return true
  }
})

export default router
