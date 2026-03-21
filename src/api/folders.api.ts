import { api } from './index'
import type { Folder } from '@/types'

export interface FoldersResponse {
  items: Folder[]
}

export const foldersApi = {
  getAll: () => api.get<FoldersResponse>('/folders'),
  create: (name: string) => api.post<Folder>('/folders', { name }),
  rename: (id: number, name: string) => api.patch<Folder>(`/folders/${id}`, { name }),
  delete: (id: number) => api.delete<{ ok: boolean }>(`/folders/${id}`)
}
