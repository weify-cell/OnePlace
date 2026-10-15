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

/**
 * 北京日期字符串向后偏移 days 天（YYYY-MM-DD 进、YYYY-MM-DD 出）。
 *
 * 与上面的区别：输入已经是日期字符串（比如库里存的整理进度），不需要先变成 Date。
 */
export function shiftBeijingDate(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** 北京小时（0-23），用于免打扰时段等判断 */
export function getBeijingHour(now: Date = new Date()): number {
  return toBeijingDate(now).getUTCHours()
}

/**
 * 北京某一天的时间窗口 `[当天 00:00, 次日 00:00)`，以 UTC ISO 字符串返回。
 *
 * 库里 `created_at` 存 UTC，按天取数时不能拿当日 00:00 直接比较——先在这里
 * 把「北京日界」换算成 UTC 时刻，调用处就不必再自己减 8 小时。
 */
export function getBeijingDayWindow(date: string): { start: string; end: string } {
  const [year, month, day] = date.split('-').map(Number)
  const startMs = Date.UTC(year, month - 1, day) - BEIJING_OFFSET_MS
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 86400000).toISOString()
  }
}

/** 人类可读北京时间：[YYYY/MM/DD HH:mm:ss 星期X 北京时间]，用于注入对话/报告的上下文 */
/**
 * 把某个时刻转成北京钟点 `HH:mm`（用于向人或模型转述时间，如"09:12–09:58"）。
 * 解析失败时原样返回，避免把非法值变成 `NaN:NaN`。
 * 注意：这**不是** formatBeijingTime——那个给的是本地化长格式（带星期与"北京时间"后缀）。
 */
export function beijingClock(value: string | Date): string {
  const ms = value instanceof Date ? value.getTime() : Date.parse(value)
  if (!Number.isFinite(ms)) return typeof value === 'string' ? value : ''
  return new Date(ms + BEIJING_OFFSET_MS).toISOString().slice(11, 16)
}

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
