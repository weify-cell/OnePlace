import { api } from './index'

export type ReportType = 'daily' | 'weekly' | 'monthly'

export interface WeChatReport {
  id: number
  user_id: string
  report_type: ReportType
  period_start: string
  period_end: string
  content: string
  created_at: string
}

export async function fetchReports(params: {
  type?: ReportType
  start?: string
  end?: string
  keyword?: string
}): Promise<WeChatReport[]> {
  const res = await api.get('/ilink/reports', { params })
  return res.data
}

export async function updateReport(id: number, content: string): Promise<WeChatReport> {
  const res = await api.put(`/ilink/reports/${id}`, { content })
  return res.data
}

export async function deleteReport(id: number): Promise<void> {
  await api.delete(`/ilink/reports/${id}`)
}
