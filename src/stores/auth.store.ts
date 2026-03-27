import { defineStore } from 'pinia'
import { authApi } from '@/api/auth.api'

const TOKEN_KEY = 'oneplace_token'

// 全局缓存 checkSetup 结果，防止 store 实例重置导致的问题
let globalCheckPromise: Promise<boolean> | null = null

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const isAuthenticated = computed(() => !!token.value)
  const needsSetup = ref<boolean | null>(null)
  const loginError = ref<string | null>(null)

  function setToken(newToken: string) {
    token.value = newToken
    localStorage.setItem(TOKEN_KEY, newToken)
  }

  function clearToken() {
    token.value = null
    localStorage.removeItem(TOKEN_KEY)
  }

  async function checkSetup(): Promise<boolean> {
    // 使用全局 promise 防止并发请求
    if (globalCheckPromise) {
      console.log('[checkSetup] Using global promise')
      return globalCheckPromise
    }

    // 如果已经检查过，直接返回缓存结果
    if (needsSetup.value !== null) {
      console.log('[checkSetup] Using cached value:', needsSetup.value)
      return needsSetup.value
    }

    console.log('[checkSetup] Starting API call')

    globalCheckPromise = (async () => {
      try {
        const res = await authApi.check()
        console.log('[checkSetup] API returned:', res.data.needsSetup)
        needsSetup.value = res.data.needsSetup
        return res.data.needsSetup
      } catch (err: any) {
        console.log('[checkSetup] API error:', err.response?.status, err.message)
        // API 失败时返回 false，避免循环跳转
        // 首次部署时如果 API 不可用，让用户停留在当前页面重试
        needsSetup.value = false
        return false
      } finally {
        // 延迟清除 promise，确保后续调用能拿到缓存值
        setTimeout(() => {
          globalCheckPromise = null
        }, 100)
      }
    })()

    return globalCheckPromise
  }

  // 重置 checkSetup 缓存（用于重新检查）
  function resetCheckSetup() {
    needsSetup.value = null
    globalCheckPromise = null
  }

  async function setupPassword(password: string): Promise<void> {
    loginError.value = null
    const res = await authApi.setup(password)
    setToken(res.data.token)
    needsSetup.value = false
  }

  async function login(password: string): Promise<void> {
    loginError.value = null
    try {
      const res = await authApi.login(password)
      setToken(res.data.token)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      loginError.value = error.response?.data?.message || '密码错误'
      throw err
    }
  }

  function logout() {
    clearToken()
    resetCheckSetup()
  }

  return { token, isAuthenticated, needsSetup, loginError, checkSetup, resetCheckSetup, setupPassword, login, logout }
})
