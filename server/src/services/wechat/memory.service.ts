import { connectDatabase } from '../../database/index.js'
import { getSettingValue } from '../settings.service.js'

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

/** 把 UTC 时刻偏移为"北京墙钟时间"的 Date，用 getUTC* 读取即得北京时间各分量。 */
function toBeijing(now: Date): Date {
  return new Date(now.getTime() + BEIJING_OFFSET_MS)
}

/** 北京日期 YYYY-MM-DD。 */
export function getMemoryDate(now: Date): string {
  const b = toBeijing(now)
  const y = b.getUTCFullYear()
  const m = String(b.getUTCMonth() + 1).padStart(2, '0')
  const d = String(b.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 每晚 00:30（北京时间）到点判定；[00:30, 00:31] 容忍调度漂移（与报告一致）。 */
export function isMemoryDue(now: Date): boolean {
  const b = toBeijing(now)
  return b.getUTCHours() === 0 && b.getUTCMinutes() >= 30 && b.getUTCMinutes() <= 31
}

export interface MemoryRow {
  id: number
  user_id: string
  content: string
  memory_date: string
  created_at: string
}

/** 落一条记忆；UNIQUE(user_id, content) 去重。返回新插入的 id，重复返回 0。 */
export function saveMemory(userId: string, content: string, memoryDate: string): number {
  const db = connectDatabase()
  const result = db.prepare(
    `INSERT OR IGNORE INTO wechat_memories (user_id, content, memory_date) VALUES (?, ?, ?)`
  ).run(userId, content, memoryDate)
  // INSERT OR IGNORE 冲突时 changes=0 而 lastInsertRowid 停留在上次值，必须用 changes 判重
  return result.changes === 0 ? 0 : Number(result.lastInsertRowid)
}

/** 查询某用户记忆。days=近 N 天（含当天），按 memory_date DESC, id DESC。 */
export function queryMemories(
  userId: string,
  opts?: { days?: number; limit?: number }
): MemoryRow[] {
  const db = connectDatabase()
  const days = opts?.days ?? 30
  const limit = opts?.limit ?? 200
  const since = getMemoryDate(new Date(Date.now() - (days - 1) * 86400000))
  return db.prepare(
    `SELECT * FROM wechat_memories
     WHERE user_id = ? AND memory_date >= ?
     ORDER BY memory_date DESC, id DESC
     LIMIT ?`
  ).all(userId, since, limit) as MemoryRow[]
}

/** 关键词检索（数据库）。 */
export function searchMemories(
  query: string,
  opts?: { userId?: string; limit?: number }
): MemoryRow[] {
  const db = connectDatabase()
  const limit = opts?.limit ?? 10
  const conditions: string[] = ['instr(content, ?) > 0']
  const values: Array<string | number> = [query]
  if (opts?.userId) { conditions.push('user_id = ?'); values.push(opts.userId) }
  values.push(limit)
  return db.prepare(
    `SELECT * FROM wechat_memories WHERE ${conditions.join(' AND ')}
     ORDER BY memory_date DESC, id DESC LIMIT ?`
  ).all(...values) as MemoryRow[]
}

/** 解析 LLM 抽取输出为条目：兼容 - / * / 数字 / 普通行，过滤空行、过短行、标题行与"无"。 */
export function parseMemoryItems(text: string): string[] {
  return text.split('\n')
    .map(line => line.trim().replace(/^[-*•]\s+/, '').replace(/^\d+[.、]\s*/, ''))
    .filter(line => line.length >= 2 && !/^#{1,6}\s/.test(line) && !['无', 'none', 'None'].includes(line))
}

/** 近30天记忆附记段（system prompt 用）；无记忆返回 ''。 */
export function buildMemoryPrompt(userId: string): string {
  const maxItems = getSettingValue<number>('ilink_memory_prompt_max_items', 0)
  const limit = maxItems > 0 ? maxItems : 500
  const items = queryMemories(userId, { days: 30, limit })
  if (items.length === 0) return ''
  const lines = items.map(m => `- ${m.memory_date.slice(5)}: ${m.content}`)
  return [
    '## 记忆（近30天）',
    `当前用户微信ID：${userId}`,
    ...lines,
    '检索记忆时请使用 search_memory / search_memory_vectors 工具并传入当前用户微信ID。'
  ].join('\n')
}
