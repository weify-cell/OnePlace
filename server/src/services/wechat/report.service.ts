import { connectDatabase } from '../../database/index.js'
import { WeChatBot } from '@wechatbot/wechatbot'
import { getSettingValue } from '../settings.service.js'
import { DEFAULT_REPORT_SYSTEM_PROMPT } from '../prompt-defaults.js'

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

// ── 生成 / 交付 / 调度 / 命令 ──────────────────────────────

let reportBot: WeChatBot | null = null
let reportTimer: ReturnType<typeof setInterval> | null = null
let reportInitTimer: ReturnType<typeof setTimeout> | null = null

export function setReportBot(bot: WeChatBot): void {
  reportBot = bot
}

function getWeChatUsers(): string[] {
  const db = connectDatabase()
  const rows = db.prepare(
    `SELECT DISTINCT key as userId FROM settings WHERE key LIKE 'ilink_user_%' LIMIT 10`
  ).all() as Array<{ userId: string }>
  return rows.map(r => r.userId.replace('ilink_user_', ''))
}

/** 组转录文本：每行 "user/assistant: 内容"。 */
function buildTranscript(rows: Array<{ role: string; content: string }>): string {
  return rows.map(r => `${r.role === 'user' ? '用户' : '助手'}: ${r.content}`).join('\n')
}

/** 生成一份报告（完整 agent loop，独立 agentId，不加载用户历史）。 */
export async function generateReport(
  userId: string,
  type: ReportType,
  window?: { start: string; end: string }
): Promise<{ content: string; window: { start: string; end: string } }> {
  const w = window ?? getReportWindow(type, new Date())
  const records = queryChatRecords(userId, w)
  const { runAgentTurn, formatBeijingTime } = await import('./ilink-bot.service.js')

  const typeLabel = getReportTypeLabel(type)
  const systemPrompt = DEFAULT_REPORT_SYSTEM_PROMPT.replace('{type}', typeLabel)
  const transcript = buildTranscript(records)
  const userContent = [
    formatBeijingTime(),
    `请生成${typeLabel}。`,
    `覆盖时间：${w.start} ~ ${w.end}（UTC）。`,
    `本次共 ${records.length} 条聊天记录${records.length === 0 ? '（该周期无聊天记录，请如实说明）' : ''}：`,
    transcript
  ].join('\n')

  const content = await runAgentTurn({
    userId,
    agentId: `report:${type}:${userId}`,
    systemPrompt,
    userContent,
    removeAfterRun: true,
    loadHistory: false,
  })
  return { content, window: w }
}

/** 生成并交付：成功→微信发送+落表；失败→兜底文案，不落表。 */
export async function sendAndPersist(
  userId: string,
  type: ReportType,
  sendFn: (userId: string, content: string) => Promise<unknown> = async (uid, c) => {
    if (!reportBot) throw new Error('bot not set')
    await reportBot.send(uid, c)
  }
): Promise<void> {
  const window = getReportWindow(type, new Date())
  try {
    const { content } = await generateReport(userId, type, window)
    await sendFn(userId, content)
    saveReport(userId, type, window, content)
    console.log(`[report] sent ${type} to ${userId}: ${content.slice(0, 40)}...`)
  } catch (error) {
    console.error(`[report] failed to generate/send ${type} for ${userId}:`, error)
    await sendFn(userId, `${getReportTypeLabel(type)}生成失败，请稍后再试。`).catch(() => {})
  }
}

/** 调度心跳：遍历用户，各类型到点即生成。无守卫。 */
export async function checkAndSendReports(): Promise<void> {
  if (!reportBot) return
  const now = new Date()
  const types: ReportType[] = ['daily', 'weekly', 'monthly']
  for (const userId of getWeChatUsers()) {
    for (const type of types) {
      if (isReportDue(type, now)) {
        await sendAndPersist(userId, type)
      }
    }
  }
}

export function startReportService(): void {
  if (reportTimer) return
  console.log('[report] starting report service')
  reportInitTimer = setTimeout(() => { reportInitTimer = null; checkAndSendReports() }, 30000)
  reportTimer = setInterval(checkAndSendReports, 60 * 1000)
}

export function stopReportService(): void {
  if (reportInitTimer) { clearTimeout(reportInitTimer); reportInitTimer = null }
  if (reportTimer) { clearInterval(reportTimer); reportTimer = null }
  reportBot = null
  console.log('[report] service stopped')
}

/** 命令入口：即时生成，回复并落表。 */
export async function handleReportCommand(
  bot: WeChatBot,
  userId: string,
  type: ReportType
): Promise<string> {
  const { content } = await generateReport(userId, type)
  const window = getReportWindow(type, new Date())
  saveReport(userId, type, window, content)
  await bot.send(userId, content)
  return content
}
