import { defineStore } from 'pinia'
import { todosApi } from '@/api/todos.api'
import type { Todo, TodoFilters, TodoProgressLog, TodoStatus } from '@/types'

export type TodoTabName = 'all' | 'todo' | 'in_progress' | 'done' | 'cancelled'

export interface TodoCounts {
  all: number
  todo: number
  in_progress: number
  done: number
  cancelled: number
}

function createDefaultFilters(): TodoFilters {
  return {
    status: null,
    priority: null,
    task_kind: null,
    type: null,
    tag: null,
    search: ''
  }
}

export const useTodoStore = defineStore('todos', () => {
  const items = ref<Todo[]>([])
  const total = ref(0)
  const loading = ref(false)
  const allTags = ref<string[]>([])
  const filters = ref<TodoFilters>(createDefaultFilters())
  const pagination = ref({ page: 1, pageSize: 20 })
  const counts = ref<TodoCounts>({ all: 0, todo: 0, in_progress: 0, done: 0, cancelled: 0 })
  const activeTab = ref<TodoTabName>('todo')

  async function fetchTodos() {
    loading.value = true
    try {
      const params: Record<string, unknown> = { ...pagination.value }
      if (filters.value.status) params.status = filters.value.status
      if (filters.value.priority) params.priority = filters.value.priority
      if (filters.value.task_kind) params.task_kind = filters.value.task_kind
      if (filters.value.type) params.type = filters.value.type
      if (filters.value.tag) params.tag = filters.value.tag
      if (filters.value.search) params.search = filters.value.search
      const res = await todosApi.getAll(params)
      items.value = res.data.items
      total.value = res.data.total
    } finally {
      loading.value = false
    }
  }

  async function createTodo(data: Partial<Todo>) {
    const res = await todosApi.create(data)
    await fetchTodos()
    return res.data
  }

  async function updateTodo(id: number, data: Partial<Todo>) {
    const res = await todosApi.update(id, data)
    const idx = items.value.findIndex(t => t.id === id)
    if (idx !== -1) items.value[idx] = res.data
    return res.data
  }

  async function updateTodoProgress(id: number, data: { progress_percent?: number | null; note?: string | null }) {
    const res = await todosApi.updateProgress(id, data)
    const idx = items.value.findIndex(t => t.id === id)
    if (idx !== -1) items.value[idx] = res.data
    return res.data
  }

  async function getTodoProgressLogs(id: number, limit = 10): Promise<TodoProgressLog[]> {
    const res = await todosApi.getProgressLogs(id, { limit })
    return res.data
  }

  async function deleteTodo(id: number) {
    await todosApi.delete(id)
    items.value = items.value.filter(t => t.id !== id)
    total.value -= 1
  }

  async function toggleStatus(id: number) {
    const todo = items.value.find(t => t.id === id)
    if (!todo) return
    const newStatus: TodoStatus = todo.status === 'done' ? 'todo' : 'done'
    return updateTodo(id, { status: newStatus })
  }

  async function fetchAllTags() {
    const res = await todosApi.getTags()
    allTags.value = res.data
  }

  async function fetchTodoCounts() {
    const res = await todosApi.getCounts()
    counts.value = res.data
  }

  async function fetchPendingCount() {
    const res = await todosApi.getPendingCount()
    return res.data
  }

  async function fetchUrgentCount() {
    const res = await todosApi.getUrgentCount()
    return res.data
  }

  function setFilter(key: keyof TodoFilters, value: unknown) {
    ;(filters.value as Record<string, unknown>)[key] = value
    pagination.value.page = 1
    fetchTodos()
  }

  function resetFilters() {
    const currentStatus = filters.value.status
    filters.value = {
      ...createDefaultFilters(),
      status: currentStatus
    }
    pagination.value.page = 1
    fetchTodos()
  }

  function setActiveTab(tab: TodoTabName) {
    activeTab.value = tab
    if (tab === 'all') {
      filters.value.status = null
    } else {
      filters.value.status = tab
    }
    pagination.value.page = 1
    fetchTodos()
    fetchTodoCounts()
  }

  return { items, total, loading, allTags, filters, pagination, counts, activeTab, fetchTodos, createTodo, updateTodo, updateTodoProgress, getTodoProgressLogs, deleteTodo, toggleStatus, fetchAllTags, fetchTodoCounts, fetchPendingCount, fetchUrgentCount, setFilter, resetFilters, setActiveTab }
})
