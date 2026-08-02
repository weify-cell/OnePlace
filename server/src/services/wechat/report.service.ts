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
