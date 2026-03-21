import { api } from './index'
import type { AuthCheckResponse, AuthResponse } from '@/types'

export const authApi = {
  check: () => api.post<AuthCheckResponse>('/auth/check'),
  setup: (password: string) => api.post<AuthResponse>('/auth/setup', { password }),
  login: (password: string) => api.post<AuthResponse>('/auth/login', { password })
}
