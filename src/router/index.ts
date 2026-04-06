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
    { path: '/toolbox', component: () => import('@/views/ToolboxView.vue'), meta: { requiresAuth: true } },
    { path: '/toolbox/json', component: () => import('@/views/tools/JsonToolView.vue'), meta: { requiresAuth: true } },
    { path: '/toolbox/image-base64', component: () => import('@/views/tools/ImageBase64ToolView.vue'), meta: { requiresAuth: true } },
    { path: '/toolbox/text-diff', component: () => import('@/views/tools/TextDiffToolView.vue'), meta: { requiresAuth: true } },
    { path: '/toolbox/timestamp', component: () => import('@/views/tools/TimestampToolView.vue'), meta: { requiresAuth: true } },
    { path: '/toolbox/crontab', component: () => import('@/views/tools/CrontabToolView.vue'), meta: { requiresAuth: true } },
    { path: '/settings', component: () => import('@/views/SettingsView.vue'), meta: { requiresAuth: true } }
  ]
})

// 导航守卫锁，防止并发执行
let isNavigating = false

router.beforeEach(async (to, from, next) => {
  // 防止并发导航
  if (isNavigating) {
    console.log('[Router] Navigation in progress, waiting...')
    // 等待当前导航完成后再试
    setTimeout(() => next(), 50)
    return
  }

  isNavigating = true
  console.log('[Router] === BeforeEach === from:', from.path, 'to:', to.path)

  try {
    const authStore = useAuthStore()
    console.log('[Router] needsSetup value:', authStore.needsSetup)

    const needsSetup = await authStore.checkSetup()
    console.log('[Router] checkSetup returned:', needsSetup)

    // 情况1: 需要设置密码且不在 /setup 页面
    if (needsSetup && to.path !== '/setup') {
      console.log('[Router] -> Redirect to /setup')
      return next('/setup')
    }

    // 情况2: 不需要设置密码，但在 /setup 页面 -> 重定向到登录
    if (!needsSetup && to.path === '/setup') {
      console.log('[Router] -> Redirect to /login (setup complete)')
      return next('/login')
    }

    // 情况3: 需要认证但没有 token
    if (to.meta.requiresAuth && !authStore.token) {
      console.log('[Router] -> Redirect to /login (needs auth)')
      return next('/login')
    }

    // 情况4: 已登录用户在登录/设置页面 -> 重定向到首页
    if ((to.path === '/login' || to.path === '/setup') && authStore.isAuthenticated && !needsSetup) {
      console.log('[Router] -> Redirect to /todos (already auth)')
      return next('/todos')
    }

    console.log('[Router] -> Proceed to', to.path)
    next()
  } catch (err) {
    console.error('[Router] Error in beforeEach:', err)
    next()
  } finally {
    isNavigating = false
  }
})

export default router
