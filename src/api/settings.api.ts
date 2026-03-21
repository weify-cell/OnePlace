import { api } from './index'
import type { Settings } from '@/types'

export const settingsApi = {
  getAll: () => api.get<Settings>('/settings'),
  set: (key: string, value: unknown) => api.put(`/settings/${key}`, { value })
}
