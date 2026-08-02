import { connectDatabase } from '../../database/index.js'

export type ReportType = 'daily' | 'weekly' | 'monthly'

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

/** 把 UTC 时刻偏移为"北京墙钟时间"的 Date，用 getUTC* 读取即得北京时间各分量。 */
function toBeijing(now: Date): Date {
  return new Date(now.getTime() + BEIJING_OFFSET_MS)
}

export function getReportTypeLabel(type: ReportType): string {
  return { daily: '日报', weekly: '周报', monthly: '月报' }[type]
}

/** 该周期内的最近一条已发报告是否跨天/跨周/跨月（用于调度到点判定，无状态守卫）。 */
function isLastDayOfBeijingMonth(now: Date): boolean {
  const b = toBeijing(now)
  const y = b.getUTCFullYear()
  const m = b.getUTCMonth()
  const d = b.getUTCDate()
  return new Date(Date.UTC(y, m, d + 1)).getUTCMonth() !== m
}

/** 到点判定（北京时间）。日报每天22:00；周报周日8:00；月报每月最后一天8:00。 */
export function isReportDue(type: ReportType, now: Date): boolean {
  const b = toBeijing(now)
  const hour = b.getUTCHours()
  const minute = b.getUTCMinutes()
  if (type === 'daily') return hour === 22 && minute === 0
  if (type === 'weekly') return b.getUTCDay() === 0 && hour === 8 && minute === 0
  // monthly
  return isLastDayOfBeijingMonth(now) && hour === 8 && minute === 0
}

/** 周期窗口。start 为北京 00:00 起（转 UTC），end 为 now。 */
export function getReportWindow(type: ReportType, now: Date): { start: string; end: string } {
  const b = toBeijing(now)
  const y = b.getUTCFullYear()
  const m = b.getUTCMonth()
  const d = b.getUTCDate()

  let startBeijingMs: number
  if (type === 'daily') {
    startBeijingMs = Date.UTC(y, m, d)
  } else if (type === 'weekly') {
    const daysSinceMonday = (b.getUTCDay() + 6) % 7
    startBeijingMs = Date.UTC(y, m, d - daysSinceMonday)
  } else {
    startBeijingMs = Date.UTC(y, m, 1)
  }
  const startUtc = new Date(startBeijingMs - BEIJING_OFFSET_MS).toISOString()
  return { start: startUtc, end: now.toISOString() }
}

export interface WeChatReportRow {
  id: number
  user_id: string
  report_type: ReportType
  period_start: string
  period_end: string
  content: string
  created_at: string
}

/** 查询窗口内的聊天记录（created_at 为 UTC，与窗口同为 ISO 字符串可直接比较）。 */
export function queryChatRecords(
  userId: string,
  window: { start: string; end: string }
): Array<{ role: string; content: string; created_at: string }> {
  const db = connectDatabase()
  return db.prepare(
    `SELECT role, content, created_at FROM wechat_messages
     WHERE user_id = ? AND created_at >= ? AND created_at < ?
     ORDER BY id ASC`
  ).all(userId, window.start, window.end) as Array<{ role: string; content: string; created_at: string }>
}

/** 落表，同周期重复由 UNIQUE + INSERT OR IGNORE 兜底。 */
export function saveReport(
  userId: string,
  type: ReportType,
  window: { start: string; end: string },
  content: string
): void {
  const db = connectDatabase()
  db.prepare(
    `INSERT OR IGNORE INTO wechat_reports (user_id, report_type, period_start, period_end, content)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, type, window.start, window.end, content)
}

/** 列表查询。start/end 用周期重叠语义过滤（period 与 [start,end) 有交集）。 */
export function listReports(params: {
  type?: ReportType
  userId?: string
  start?: string
  end?: string
}): WeChatReportRow[] {
  const db = connectDatabase()
  const conditions: string[] = []
  const values: Array<string | number> = []
  if (params.type) { conditions.push('report_type = ?'); values.push(params.type) }
  if (params.userId) { conditions.push('user_id = ?'); values.push(params.userId) }
  if (params.start) { conditions.push('period_end > ?'); values.push(params.start) }
  if (params.end) { conditions.push('period_start < ?'); values.push(params.end) }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return db.prepare(`SELECT * FROM wechat_reports ${where} ORDER BY period_start DESC`).all(...values) as WeChatReportRow[]
}

export function getReportById(id: number): WeChatReportRow | null {
  const db = connectDatabase()
  const row = db.prepare('SELECT * FROM wechat_reports WHERE id = ?').get(id) as WeChatReportRow | undefined
  return row ?? null
}
