import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'

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
    { path: '/settings', component: () => import('@/views/SettingsView.vue'), meta: { requiresAuth: true } }
  ]
})

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()
  const needsSetup = await authStore.checkSetup()

  if (needsSetup && to.path !== '/setup') return next('/setup')
  if (to.meta.requiresAuth && !authStore.token) return next('/login')
  if ((to.path === '/login' || to.path === '/setup') && authStore.isAuthenticated && !needsSetup) return next('/todos')

  next()
})

export default router
