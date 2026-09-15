/**
 * 北京时间工具（服务端唯一入口）。
 *
 * 全站按北京时间（Asia/Shanghai）处理日期与时间：提醒到点判定、日报/记忆整理周期、
 * 免打扰时段、逾期判断等一律走这里，避免各文件重复实现，也避免混用
 * `toISOString()`（UTC）或 `setHours()`（服务器本地时区）导致跨日错位。
 *
 * 约定：日期字符串统一为 `YYYY-MM-DD`，日期时间为 `YYYY-MM-DD HH:mm(:ss)`，
 * 以便与库中 `reminder_time` / `due_date` / `period_start` 等字段直接字符串比较。
 */

/** 北京时区相对 UTC 的毫秒偏移（+08:00），需要自行拼装 UTC 时刻时使用 */
export const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

/**
 * 把 UTC 时刻偏移为「北京墙钟时间」的 Date：
 * 用 `getUTC*` 系列读取，即得北京时间各分量（不依赖服务器本地时区）。
 */
export function toBeijingDate(now: Date = new Date()): Date {
  return new Date(now.getTime() + BEIJING_OFFSET_MS)
}

/** 北京日期，格式 YYYY-MM-DD */
export function getBeijingDate(now: Date = new Date()): string {
  const b = toBeijingDate(now)
  const year = b.getUTCFullYear()
  const month = String(b.getUTCMonth() + 1).padStart(2, '0')
  const day = String(b.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 北京日期时间，格式 YYYY-MM-DD HH:mm */
export function getBeijingDateTime(now: Date = new Date()): string {
  return getBeijingDateTimeSec(now).slice(0, 16)
}

/** 北京日期时间，格式 YYYY-MM-DD HH:mm:ss */
export function getBeijingDateTimeSec(now: Date = new Date()): string {
  const b = toBeijingDate(now)
  const year = b.getUTCFullYear()
  const month = String(b.getUTCMonth() + 1).padStart(2, '0')
  const day = String(b.getUTCDate()).padStart(2, '0')
  const hour = String(b.getUTCHours()).padStart(2, '0')
  const minute = String(b.getUTCMinutes()).padStart(2, '0')
  const second = String(b.getUTCSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

/** 北京日期向后偏移 days 天，格式 YYYY-MM-DD（跨月/跨年由 Date 自动进位） */
export function getBeijingDateAfter(days: number, now: Date = new Date()): string {
  const b = toBeijingDate(now)
  const shifted = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate() + days))
  return shifted.toISOString().slice(0, 10)
}

/** 北京小时（0-23），用于免打扰时段等判断 */
export function getBeijingHour(now: Date = new Date()): number {
  return toBeijingDate(now).getUTCHours()
}

/** 人类可读北京时间：[YYYY/MM/DD HH:mm:ss 星期X 北京时间]，用于注入对话/报告的上下文 */
export function formatBeijingTime(now: Date = new Date()): string {
  const timestamp = now.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  const weekDay = now.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    weekday: 'long'
  })
  return `[${timestamp} ${weekDay} 北京时间]`
}
