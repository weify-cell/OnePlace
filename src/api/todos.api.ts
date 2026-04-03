import { api } from './index'
import type { Todo, TodosResponse } from '@/types'
import type { TodoCounts } from '@/stores/todo.store'

export const todosApi = {
  getAll: (params?: Record<string, unknown>) => api.get<TodosResponse>('/todos', { params }),
  getById: (id: number) => api.get<Todo>(`/todos/${id}`),
  create: (data: Partial<Todo>) => api.post<Todo>('/todos', data),
  update: (id: number, data: Partial<Todo>) => api.patch<Todo>(`/todos/${id}`, data),
  delete: (id: number) => api.delete(`/todos/${id}`),
  getTags: () => api.get<string[]>('/todos/tags'),
  getCounts: () => api.get<TodoCounts>('/todos/counts'),
  getPendingCount: () => api.get<{ count: number }>('/todos/pending-count'),
  getUrgentCount: () => api.get<{ count: number }>('/todos/urgent-count')
}
