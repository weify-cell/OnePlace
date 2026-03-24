import { defineStore } from 'pinia'
import { authApi } from '@/api/auth.api'

const TOKEN_KEY = 'oneplace_token'

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
    try {
      const res = await authApi.check()
      needsSetup.value = res.data.needsSetup
      return res.data.needsSetup
    } catch {
      // API 失败时返回 true（保守策略），避免误判为已设置密码导致循环跳转
      needsSetup.value = true
      return true
    }
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
  }

  return { token, isAuthenticated, needsSetup, loginError, checkSetup, setupPassword, login, logout }
})
