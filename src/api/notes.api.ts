import { api } from './index'
import type { Note, NotesResponse } from '@/types'

export const notesApi = {
  getAll: (params?: Record<string, unknown>) => api.get<NotesResponse>('/notes', { params }),
  getById: (id: number) => api.get<Note>(`/notes/${id}`),
  create: () => api.post<Note>('/notes'),
  update: (id: number, data: Partial<Note>) => api.patch<Note>(`/notes/${id}`, data),
  delete: (id: number) => api.delete(`/notes/${id}`),
  pin: (id: number, is_pinned: boolean) => api.patch<Note>(`/notes/${id}/pin`, { is_pinned }),
  archive: (id: number, is_archived: boolean) => api.patch<Note>(`/notes/${id}/archive`, { is_archived }),
  getTags: () => api.get<string[]>('/notes/tags')
}
