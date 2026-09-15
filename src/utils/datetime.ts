/**
 * 北京时间工具（前端唯一入口）。
 *
 * 与后端 `server/src/utils/time.ts` 口径一致：全站按北京时间（Asia/Shanghai）处理日期。
 * 不要用 `new Date().toISOString().split('T')[0]`（那是 UTC 日期）或依赖浏览器本地时区，
 * 否则北京时间 00:00–08:00 期间会与后端差一天。
 */

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

/** 北京日期 YYYY-MM-DD */
export function getBeijingDate(date: Date = new Date()): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

/** UTC ISO 时间戳 → 北京日期 YYYY-MM-DD */
export function toBeijingDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

/** UTC ISO 时间戳 → 北京日期中文标签（如 2026/09/10） */
export function toBeijingDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
}

/**
 * 北京日期 YYYY-MM-DD → 该日北京 00:00 对应的 UTC ISO。
 * inclusiveEnd=true 时取次日北京 00:00，用作排他上界（含当天）。
 */
export function beijingDateToUtcIso(dateStr: string, inclusiveEnd = false): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  if (inclusiveEnd) d.setUTCDate(d.getUTCDate() + 1)
  // 北京 00:00 = UTC 同日 16:00 的前一天
  return new Date(d.getTime() - BEIJING_OFFSET_MS).toISOString()
}

/** 目标日期（YYYY-MM-DD）距北京今天的天数差：0=今天，正数=未来，负数=已逾期 */
export function daysFromBeijingToday(dateStr: string): number {
  const dayMs = 24 * 60 * 60 * 1000
  const target = new Date(`${dateStr}T00:00:00.000Z`).getTime()
  const today = new Date(`${getBeijingDate()}T00:00:00.000Z`).getTime()
  return Math.round((target - today) / dayMs)
}
