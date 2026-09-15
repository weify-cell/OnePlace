import { connectDatabase } from '../../database/index.js'
import { WeChatBot } from '@wechatbot/wechatbot'
import { runAgentTurn } from '../ai/agent-turn.js'
import { buildSystemPrompt } from '../ai/prompt.js'
import { formatBeijingTime } from '../../utils/time.js'
import { BEIJING_OFFSET_MS, toBeijingDate } from '../../utils/time.js'
import { getWeChatUsers } from './users.service.js'
import { getILinkModel } from './model.js'
import { isDeliveryReady, sendToUser, withInflight } from './delivery.js'
import type { SubsystemJob } from './scheduler.js'

export type ReportType = 'daily' | 'weekly' | 'monthly'

export function getReportTypeLabel(type: ReportType): string {
  return { daily: '日报', weekly: '周报', monthly: '月报' }[type]
}

/** 该周期内的最近一条已发报告是否跨天/跨周/跨月（用于调度到点判定，无状态守卫）。 */
function isLastDayOfBeijingMonth(now: Date): boolean {
  const b = toBeijingDate(now)
  const y = b.getUTCFullYear()
  const m = b.getUTCMonth()
  const d = b.getUTCDate()
  return new Date(Date.UTC(y, m, d + 1)).getUTCMonth() !== m
}

/** 到点判定（北京时间）。日报每天23:30；周报周日8:00；月报每月最后一天8:00。
 * 分钟匹配放宽到 1 分钟窗口（整点/整半点 +1 分钟）：容忍事件循环阻塞/定时器漂移错过，配合 DB 去重不会重复发送。 */
export function isReportDue(type: ReportType, now: Date): boolean {
  const b = toBeijingDate(now)
  const hour = b.getUTCHours()
  const minute = b.getUTCMinutes()
  if (type === 'daily') return hour === 23 && minute >= 30 && minute <= 31
  if (type === 'weekly') return b.getUTCDay() === 0 && hour === 8 && minute <= 1
  // monthly
  return isLastDayOfBeijingMonth(now) && hour === 8 && minute <= 1
}

/** 周期窗口。start 为北京 00:00 起（转 UTC），end 为 now。 */
export function getReportWindow(type: ReportType, now: Date): { start: string; end: string } {
  const b = toBeijingDate(now)
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
  keyword?: string
}): WeChatReportRow[] {
  const db = connectDatabase()
  const conditions: string[] = []
  const values: Array<string | number> = []
  if (params.type) { conditions.push('report_type = ?'); values.push(params.type) }
  if (params.userId) { conditions.push('user_id = ?'); values.push(params.userId) }
  if (params.start) { conditions.push('period_end > ?'); values.push(params.start) }
  if (params.end) { conditions.push('period_start < ?'); values.push(params.end) }
  if (params.keyword) {
    conditions.push('(instr(content, ?) > 0 OR instr(period_start, ?) > 0 OR instr(period_end, ?) > 0)')
    values.push(params.keyword, params.keyword, params.keyword)
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return db.prepare(`SELECT * FROM wechat_reports ${where} ORDER BY period_start DESC`).all(...values) as WeChatReportRow[]
}

export function getReportById(id: number): WeChatReportRow | null {
  const db = connectDatabase()
  const row = db.prepare('SELECT * FROM wechat_reports WHERE id = ?').get(id) as WeChatReportRow | undefined
  return row ?? null
}

/** 编辑报告内容，返回更新后的行；id 不存在返回 null。 */
export function updateReportContent(id: number, content: string): WeChatReportRow | null {
  const db = connectDatabase()
  const result = db.prepare('UPDATE wechat_reports SET content = ? WHERE id = ?').run(content, id)
  if (result.changes === 0) return null
  return getReportById(id)
}

/** 删除报告，返回是否实际删除了一行。 */
export function deleteReport(id: number): boolean {
  const db = connectDatabase()
  const result = db.prepare('DELETE FROM wechat_reports WHERE id = ?').run(id)
  return result.changes > 0
}

/** 按周期起点查已落库报告（用于发送前去重：命令已生成则定时不再发）。 */
export function findReportByPeriod(
  userId: string,
  type: ReportType,
  periodStart: string
): WeChatReportRow | null {
  const db = connectDatabase()
  const row = db.prepare(
    'SELECT * FROM wechat_reports WHERE user_id = ? AND report_type = ? AND period_start = ?'
  ).get(userId, type, periodStart) as WeChatReportRow | undefined
  return row ?? null
}

// ── 生成 / 交付 / 调度 / 命令 ──────────────────────────────

/** 内存级 in-flight 去重已下沉到 delivery.withInflight（同一 (userId, type)）。 */

/** 报告子系统作业描述。
 * 每分钟检查一次到点（日报 23:30 / 周报周日 8:00 / 月报月末 8:00），
 * 首次延迟 30 秒等 WeChatBot 的 contextStore 就绪。发送由 delivery 模块负责。 */
export const reportJob: SubsystemJob = {
  name: 'report',
  run: checkAndSendReports,
  intervalMinutes: () => 1,
  initDelayMs: 30_000,
}

/** 组转录文本：每行 "user/assistant: 内容"。 */
export function buildTranscript(rows: Array<{ role: string; content: string }>): string {
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

  const typeLabel = getReportTypeLabel(type)
  const systemPrompt = await buildSystemPrompt({ kind: 'report', reportType: typeLabel })
  const transcript = buildTranscript(records)
  const userContent = [
    formatBeijingTime(),
    `请生成${typeLabel}。`,
    `覆盖时间：${w.start} ~ ${w.end}（UTC）。`,
    `本次共 ${records.length} 条聊天记录${records.length === 0 ? '（该周期无聊天记录，请如实说明）' : ''}：`,
    transcript
  ].join('\n')

  const content = await runAgentTurn({
    agentId: `report:${type}:${userId}`,
    systemPrompt,
    userContent,
    ephemeral: true,
    ...getILinkModel(),
  })
  return { content, window: w }
}

/** 生成并交付：成功→微信发送+落表；失败→兜底文案，不落表。
 * 发送前先去重：同 (userId,type,period_start) 已落库（如手动 /日报）则跳过；
 * 并发去重由 delivery 的 withInflight 保证同 (user,type) 同时只跑一个。 */
export async function sendAndPersist(
  userId: string,
  type: ReportType,
  sendFn: (userId: string, content: string) => Promise<unknown> = async (uid, c) => {
    await sendToUser(uid, c)
  }
): Promise<void> {
  const window = getReportWindow(type, new Date())
  // 该周期已落库（命令 /日报 先跑过）：跳过发送与落库，避免用户当天收到两条
  if (findReportByPeriod(userId, type, window.start)) {
    console.log(`[report] ${type} for ${userId} period ${window.start} already exists, skip`)
    return
  }

  await withInflight(`${userId}:${type}`, async () => {
    try {
      const { content } = await generateReport(userId, type, window)
      await sendFn(userId, content)
      saveReport(userId, type, window, content)
      console.log(`[report] sent ${type} to ${userId}: ${content.slice(0, 40)}...`)
    } catch (error) {
      console.error(`[report] failed to generate/send ${type} for ${userId}:`, error)
      await sendFn(userId, `${getReportTypeLabel(type)}生成失败，请稍后再试。`).catch(() => {})
    }
  })
}

/** 调度心跳：遍历用户，各类型到点即生成。无守卫。 */
export async function checkAndSendReports(): Promise<void> {
  if (!isDeliveryReady()) return
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

/** 命令入口：即时生成并落表，返回 content 不发送（发送由命令处理器 reply）。 */
export async function handleReportCommand(
  bot: WeChatBot,
  userId: string,
  type: ReportType
): Promise<string> {
  const { content, window } = await generateReport(userId, type)
  saveReport(userId, type, window, content)
  return content
}
