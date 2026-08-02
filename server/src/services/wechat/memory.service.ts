import { connectDatabase } from '../../database/index.js'
import { getSettingValue } from '../settings.service.js'
import { getReportWindow, queryChatRecords, buildTranscript, getWeChatUsers } from './report.service.js'
import { DEFAULT_MEMORY_SYSTEM_PROMPT, DEFAULT_MEMORY_USER_TEMPLATE } from '../prompt-defaults.js'
import { embedText } from '../ai/embedding-client.js'
import { upsertChunks, searchChunks } from '../vector/vector.service.js'

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

/** 单用户部署时回退主用户；多用户/无用户返回 null（调用方需显式传 user_id）。 */
export function resolvePrimaryMemoryUser(): string | null {
  const users = getWeChatUsers()
  return users.length === 1 ? users[0] : null
}

/** 统计某用户某日已落库条数（用于整理后 saved 差值）。 */
function countMemories(userId: string, memoryDate: string): number {
  const db = connectDatabase()
  const row = db.prepare(
    'SELECT COUNT(*) c FROM wechat_memories WHERE user_id = ? AND memory_date = ?'
  ).get(userId, memoryDate) as { c: number }
  return row.c
}

/** 近30天记忆附记段（system prompt 用）；无记忆返回 ''。 */
export function buildMemoryPrompt(userId: string): string {
  const maxItems = getSettingValue<number>('ilink_memory_prompt_max_items', 0)
  const limit = maxItems > 0 ? maxItems : 100000
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

// ── 向量存取 ──────────────────────────────────────────────

/** 记忆向量库 collection 名（独立于笔记知识库）。 */
function getMemoryCollection(): string {
  return getSettingValue<string>('qdrant_memory_collection', 'oneplace_memory')
}

/** 给单条记忆条目 embedding 并写入记忆向量库。 */
async function upsertMemoryVector(userId: string, memoryId: number, content: string, memoryDate: string): Promise<void> {
  const provider = getSettingValue<string>('embedding_provider', 'qwen')
  const model = getSettingValue<string>('embedding_model', 'text-embedding-v4')
  const vector = await embedText(content, provider, model)
  const result = await upsertChunks([{
    id: `mem${memoryId}`,
    vector,
    content,
    metadata: { memory_id: memoryId, user_id: userId, memory_date: memoryDate }
  }], getMemoryCollection())
  if (!result.success) throw new Error(result.error || 'memory vector upsert failed')
}

/** 单条记忆写入口（add_memory 工具调用）：落库→新增才写向量。重复内容返回 duplicate 不写向量。 */
export async function addMemory(
  userId: string,
  content: string,
  memoryDate: string
): Promise<{ status: 'new' | 'duplicate'; vectorOk: boolean; memoryId: number }> {
  const id = saveMemory(userId, content, memoryDate)
  if (id === 0) return { status: 'duplicate', vectorOk: false, memoryId: 0 }
  let vectorOk = true
  try {
    await upsertMemoryVector(userId, id, content, memoryDate)
  } catch (err) {
    vectorOk = false
    console.error(`[memory] vector upsert failed for memory #${id}:`, err)
  }
  return { status: 'new', vectorOk, memoryId: id }
}

/** 语义检索记忆向量库；失败返回空数组（不阻断对话）。 */
export async function searchMemoryVectors(
  query: string,
  opts?: { userId?: string; limit?: number }
): Promise<Array<{ memory_id: number; content: string; memory_date: string; score: number }>> {
  try {
    const provider = getSettingValue<string>('embedding_provider', 'qwen')
    const model = getSettingValue<string>('embedding_model', 'text-embedding-v4')
    const queryVector = await embedText(query, provider, model)
    const filter = opts?.userId ? { must: [{ key: 'user_id', match: { value: opts.userId } }] } : undefined
    const results = await searchChunks(queryVector, opts?.limit ?? 5, { collection: getMemoryCollection(), filter })
    return results.map(r => {
      const p = r.payload as { memory_id?: number; content?: string; memory_date?: string }
      return {
        memory_id: p.memory_id ?? 0,
        content: p.content ?? '',
        memory_date: p.memory_date ?? '',
        score: r.score
      }
    })
  } catch (err) {
    console.error('[memory] vector search failed:', err)
    return []
  }
}

// ── 每晚整理 ──────────────────────────────────────────────

/** 内存级 in-flight 锁：同一用户同时只允许一个整理在跑。 */
const inflightMemories = new Set<string>()

/** 渲染用户消息模板：把 {key} 占位符替换为实际值（用 split/join 避免 replace 的 $ 特殊字符问题）。 */
function renderMemoryTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.split(`{${key}}`).join(value),
    template
  )
}

/** 整理某用户昨天对话：抽取记忆→由 agent 逐条调用 add_memory 工具写入。静默执行，不发送微信消息。 */
export async function consolidateDayMemory(userId: string): Promise<{ saved: number }> {
  const now = new Date()
  // 00:30 整理的是刚结束的「昨天」全天：[昨天北京 00:00, 今天北京 00:00)，memory_date 标为昨天。
  const todayStart = getReportWindow('daily', now).start // 今天北京 00:00（UTC）
  const window = {
    start: new Date(new Date(todayStart).getTime() - 86400000).toISOString(), // 昨天北京 00:00
    end: todayStart
  }
  const memoryDate = getMemoryDate(new Date(now.getTime() - 86400000)) // 昨天
  const records = queryChatRecords(userId, window)
  if (records.length === 0) {
    console.log(`[memory] no messages yesterday for ${userId}, skip`)
    return { saved: 0 }
  }

  const recentMemories = queryMemories(userId, { days: 30, limit: 500 })
  const { runAgentTurn, formatBeijingTime } = await import('./ilink-bot.service.js')
  // 提示词与用户消息模板均可配置（微信 Bot 设置页「记忆整理」tab），缺失时回退默认值
  const systemPrompt = getSettingValue<string>('ilink_memory_system_prompt', DEFAULT_MEMORY_SYSTEM_PROMPT)
  const template = getSettingValue<string>('ilink_memory_user_template', DEFAULT_MEMORY_USER_TEMPLATE)
  const userContent = renderMemoryTemplate(template, {
    beijingTime: formatBeijingTime(),
    userId,
    memoryDate,
    recordCount: String(records.length),
    transcript: buildTranscript(records),
    recentMemories: recentMemories.length > 0
      ? `\n以下为已有记忆，请勿重复抽取：\n${recentMemories.map(m => `- ${m.content}`).join('\n')}`
      : ''
  })

  // 写库由 agent 在 loop 内调用 add_memory 工具完成；saved 用 (user, memory_date) 行数差值统计
  const before = countMemories(userId, memoryDate)
  await runAgentTurn({
    userId,
    agentId: `memory:consolidate:${userId}`,
    systemPrompt,
    userContent,
    removeAfterRun: true,
    loadHistory: false
  })
  const saved = countMemories(userId, memoryDate) - before
  console.log(`[memory] consolidated ${userId}: saved=${saved}`)
  return { saved }
}

// ── 调度 ──────────────────────────────────────────────────

let memoryTimer: ReturnType<typeof setInterval> | null = null
let memoryInitTimer: ReturnType<typeof setTimeout> | null = null

/** 心跳：到点则遍历用户逐人整理（in-flight 锁防并发）。 */
export async function checkAndConsolidateMemories(): Promise<void> {
  if (!isMemoryDue(new Date())) return
  for (const userId of getWeChatUsers()) {
    if (inflightMemories.has(userId)) continue
    inflightMemories.add(userId)
    try {
      await consolidateDayMemory(userId)
    } catch (err) {
      console.error(`[memory] consolidate failed for ${userId}:`, err)
    } finally {
      inflightMemories.delete(userId)
    }
  }
}

export function startMemoryService(): void {
  if (memoryTimer) return
  console.log('[memory] starting memory service')
  memoryInitTimer = setTimeout(() => { memoryInitTimer = null; checkAndConsolidateMemories() }, 30000)
  memoryTimer = setInterval(checkAndConsolidateMemories, 60 * 1000)
}

export function stopMemoryService(): void {
  if (memoryInitTimer) { clearTimeout(memoryInitTimer); memoryInitTimer = null }
  if (memoryTimer) { clearInterval(memoryTimer); memoryTimer = null }
  console.log('[memory] service stopped')
}
