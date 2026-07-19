export interface AuthCheckResponse {
  needsSetup: boolean
}

export interface AuthResponse {
  token: string
}

export type TodoPriority = 'low' | 'medium' | 'high' | 'urgent'
export type TodoStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'
export type TodoType = 'work' | 'study' | 'personal' | 'health' | 'finance' | 'family'
export type TodoTaskKind = 'one_time' | 'long_term'

export interface Todo {
  id: number
  title: string
  description: string | null
  priority: TodoPriority
  status: TodoStatus
  task_kind: TodoTaskKind
  progress_percent: number | null
  last_progress_note: string | null
  type: TodoType | null
  due_date: string | null
  reminder_time: string | null
  reminder_enabled: boolean
  tags: string[]
  is_deleted: boolean
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface TodoProgressLog {
  id: number
  todo_id: number
  content: string
  created_at: string
}

export interface TodosResponse {
  items: Todo[]
  total: number
  page: number
  pageSize: number
}

export interface TodoFilters {
  status: TodoStatus | null
  priority: TodoPriority | null
  task_kind: TodoTaskKind | null
  type: TodoType | null
  tag: string | null
  search: string
}

export interface Folder {
  id: number
  name: string
  created_at: string
  updated_at: string
}

export interface Note {
  id: number
  title: string
  content: string
  content_text: string
  content_format?: 'tiptap' | 'markdown'
  tags: string[]
  folder_id?: number | null
  is_pinned: boolean
  is_archived: boolean
  is_deleted: boolean
  is_knowledge_base?: boolean
  created_at: string
  updated_at: string
}

export interface NoteImage {
  filename: string
  url: string
  used_in_content: boolean
}

export interface NotesResponse {
  items: Note[]
  total: number
  page: number
  pageSize: number
}

export interface NoteFuzzySearchMatch {
  index: number
  note_id: number
  note_title: string
  start: number
  end: number
  keyword_start: number
  keyword_end: number
  content: string
}

export interface NoteFuzzySearchResult {
  query: string
  selectedIndex: number
  totalMatches: number
  match: NoteFuzzySearchMatch | null
  matches: Array<Pick<NoteFuzzySearchMatch, 'index' | 'note_id' | 'note_title' | 'start' | 'end'>>
}

export interface Conversation {
  id: number
  title: string
  model: string
  provider: string
  kb_enabled?: boolean
  tools_enabled?: boolean
  max_tool_rounds?: number
  is_deleted: boolean
  created_at: string
  updated_at: string
}

export interface KBCitation {
  note_id: number
  title: string
  content: string
  score: number
}

export interface ToolCallRecord {
  id: string
  name: string
  arguments: Record<string, any>
  result: string
  isError: boolean
}

export interface Message {
  id: number
  conversation_id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  tokens_used: number | null
  is_error: boolean
  kb_citations: KBCitation[] | null
  tool_calls: ToolCallRecord[] | null
  created_at: string
}

export interface StreamState {
  thinking: string
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, any>; status: 'running' | 'completed'; result?: string }>
}

export interface AIProviderConfig {
  apiKey?: string
  baseURL?: string
}

export interface AIProviderInfo {
  name: string
  displayName: string
  models: { id: string; name: string }[]
}

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  default_provider: string
  default_model: string
  ai_providers: Record<string, AIProviderConfig>
  available_providers: AIProviderInfo[]
}

export const TODO_PRIORITY_LABELS: Record<TodoPriority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急'
}

export const TODO_STATUS_LABELS: Record<TodoStatus, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
  cancelled: '已取消'
}

export const TODO_TYPE_LABELS: Record<TodoType, string> = {
  work: '工作',
  study: '学习',
  personal: '个人',
  health: '健康',
  finance: '财务',
  family: '家庭'
}

export const TODO_TASK_KIND_LABELS: Record<TodoTaskKind, string> = {
  one_time: '一次性',
  long_term: '长期'
}

export const TODO_PRIORITY_COLORS: Record<TodoPriority, string> = {
  low: 'info',
  medium: 'default',
  high: 'warning',
  urgent: 'error'
}

export const TODO_TYPE_ICONS: Record<TodoType, string> = {
  work: '💼',
  study: '📚',
  personal: '👤',
  health: '❤️',
  finance: '💰',
  family: '🏠'
}
