import { api } from './index'
import type { Todo, TodosResponse } from '@/types'

export const todosApi = {
  getAll: (params?: Record<string, unknown>) => api.get<TodosResponse>('/todos', { params }),
  getById: (id: number) => api.get<Todo>(`/todos/${id}`),
  create: (data: Partial<Todo>) => api.post<Todo>('/todos', data),
  update: (id: number, data: Partial<Todo>) => api.patch<Todo>(`/todos/${id}`, data),
  delete: (id: number) => api.delete(`/todos/${id}`),
  getTags: () => api.get<string[]>('/todos/tags')
}
