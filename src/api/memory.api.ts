import { api } from '@/api'

/** 记忆类型：状态型会被同主题新值取代，事件型随时间退场，null 是未分类的历史数据 */
export type MemoryKind = 'state' | 'event' | null

export interface MemoryItem {
  id: number
  user_id: string
  content: string
  memory_date: string
  created_at: string
  kind: MemoryKind
  topic: string | null
  superseded_by: number | null
  last_hit_at: string | null
  archived_at: string | null
}

export type MemoryFilter = 'all' | 'state' | 'event' | 'archived'

export interface MemoryListResponse {
  items: MemoryItem[]
  total: number
  page: number
  pageSize: number
  filter: MemoryFilter
  /** 命中次数与汇总比率需要检索事件表（工单 02），未落地前为 false */
  stats_available: boolean
}

export function fetchMemories(params: {
  filter?: MemoryFilter
  page?: number
  pageSize?: number
}): Promise<MemoryListResponse> {
  return api.get<MemoryListResponse>('/memory', { params }).then(r => r.data)
}
