import { connectDatabase } from '../../database/index.js'
import { getSettingValue } from '../settings.service.js'
import { queryChatRecords, buildTranscript } from './report.service.js'
import { getWeChatUsers, getMemoryConsolidatedDate, setMemoryConsolidatedDate } from './users.service.js'
import { getILinkModel } from './model.js'
import { withInflight } from '../../utils/inflight.js'
import type { SubsystemJob } from './scheduler.js'
import { runAgentTurn, wechatTaskAgentId, type AgentTurnRequest } from '../ai/agent-turn.js'
import { buildMemoryUserContent, buildSystemPrompt } from '../ai/prompt.js'
import { formatBeijingTime, getBeijingDate, getBeijingDateAfter, getBeijingDayWindow, shiftBeijingDate, toBeijingDate } from '../../utils/time.js'
import { embedText } from '../ai/embedding-client.js'
import { upsertChunks, searchChunks } from '../vector/vector.service.js'

/** 北京日期 YYYY-MM-DD。 */
export function getMemoryDate(now: Date): string {
  return getBeijingDate(now)
}

/** 每晚 00:30（北京时间）到点判定；[00:30, 00:31] 容忍调度漂移（与报告一致）。 */
export function isMemoryDue(now: Date): boolean {
  const b = toBeijingDate(now)
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

/**
 * 去掉正文里的用户 ID 痕迹。
 *
 * 模型会把提示词里的「当前用户微信ID」写进记忆正文，而且写成 `（o9cq80...）`
 * 这种缩写形式（全库 184/210 条中招）。提示词已不再把 ID 交给模型，
 * 这里再做一道服务端清理，保证落库的正文干净、检索与注入不被噪声污染。
 */
export function stripUserIds(content: string, userId: string): string {
  const bare = userId.includes('@') ? userId.slice(0, userId.indexOf('@')) : userId
  /** 括号里的内容是不是这个用户（或其可辨识前缀，允许省略号收尾） */
  const looksLikeId = (inner: string): boolean => {
    const t = inner.replace(/[.．。…\s]+$/g, '').trim()
    if (t.length < 4) return false
    return userId.startsWith(t) || bare.startsWith(t) || t === userId || t === bare
  }
  let out = content.replace(/（([^（）]*)）|\(([^()]*)\)/g, (match, full: string, ascii: string) =>
    looksLikeId(full ?? ascii ?? '') ? '' : match
  )
  for (const id of [userId, bare]) {
    if (id) out = out.split(id).join('')
  }
  return out.replace(/[ \t]{2,}/g, ' ').trim()
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
    ...lines,
    '检索旧记忆时调用 search_memory / search_memory_vectors 工具即可，不需要传用户 ID。'
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

/** 内容最短长度：低于此长度的内容不是「一句完整、独立、可检索的话」 */
const MIN_CONTENT_LENGTH = 2

/**
 * 单条记忆写入口（add_memory 工具调用）：落库→新增才写向量。
 *
 * 对话中的即时写入与每晚整理都走这里——校验、归一化、去重只此一处，
 * 不在工具层再抄一份（抄两份就会有一份先腐）。
 * 返回 `invalid` 表示内容不合格（空白、过短，或去掉 ID 痕迹后所剩无几）。
 */
export async function addMemory(
  userId: string,
  content: string,
  memoryDate: string
): Promise<{ status: 'new' | 'duplicate' | 'invalid'; vectorOk: boolean; memoryId: number }> {
  const cleaned = stripUserIds((content || '').trim(), userId)
  if (cleaned.length < MIN_CONTENT_LENGTH) return { status: 'invalid', vectorOk: false, memoryId: 0 }
  const id = saveMemory(userId, cleaned, memoryDate)
  if (id === 0) return { status: 'duplicate', vectorOk: false, memoryId: 0 }
  let vectorOk = true
  try {
    await upsertMemoryVector(userId, id, cleaned, memoryDate)
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

/** 并发去重：同一用户同时只允许一个整理在跑（由 delivery 的 withInflight 实现）。 */

/** 整理一轮的内容由调用方注入：LLM 是系统边界，测试可换掉而不必 mock 自家模块。 */
export type MemoryTurnRunner = (req: AgentTurnRequest) => Promise<string>

/**
 * 该补哪几天的整理：从「上次成功的次日」到昨天，逐日一天。
 *
 * 整理窗口只有 [00:30, 00:31] 两分钟，服务当时没跑就会漏掉那天；
 * 有了这个函数，错过的那天会在下一次成功到点时补上，而不是永久丢失。
 * 从未成功过时只补昨天——不回溯全部历史（早期的日子不属于「漏掉」，
 * 且一次性回溯几十天会突然拉满模型用量）。
 */
export function pendingConsolidationDates(lastConsolidated: string | null, now: Date): string[] {
  const yesterday = getBeijingDateAfter(-1, now)
  const dates: string[] = []
  let cursor = lastConsolidated ? shiftBeijingDate(lastConsolidated, 1) : yesterday
  while (cursor <= yesterday) {
    dates.push(cursor)
    cursor = shiftBeijingDate(cursor, 1)
  }
  return dates
}

/**
 * 整理某用户某一日的对话：抽取记忆→由 agent 逐条调用 add_memory 工具写入。
 *
 * 默认整理「昨天」（00:30 到点时的常规目标）；补跑时由调用方显式指定目标日。
 * 静默执行，不发送微信消息。
 */
export async function consolidateDayMemory(
  userId: string,
  memoryDate: string = getBeijingDateAfter(-1, new Date()),
  runTurn: MemoryTurnRunner = runAgentTurn
): Promise<{ saved: number }> {
  const records = queryChatRecords(userId, getBeijingDayWindow(memoryDate))
  if (records.length === 0) {
    console.log(`[memory] no messages on ${memoryDate} for ${userId}, skip`)
    return { saved: 0 }
  }

  const recentMemories = queryMemories(userId, { days: 30, limit: 500 })
  // 提示词与用户消息模板均由 ai/prompt.ts 统一解析（设置优先，回退唯一默认值）
  const systemPrompt = await buildSystemPrompt({ kind: 'memory' })
  const userContent = buildMemoryUserContent({
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
  await runTurn({
    agentId: wechatTaskAgentId('memory', `consolidate:${userId}`),
    systemPrompt,
    userContent,
    memoryUserId: userId,
    ephemeral: true,
    ...getILinkModel(),
  })
  const saved = countMemories(userId, memoryDate) - before
  console.log(`[memory] consolidated ${userId} ${memoryDate}: saved=${saved}`)
  return { saved }
}

/**
 * 把欠下的整理一次性补齐（通常只有昨天一天）。
 *
 * 每一天处理完才记账：中途抛错不记账，于是下次运行仍会重试那天——
 * 「已整理」这个事实只由成功来写成。
 */
export async function consolidatePendingMemories(
  userId: string,
  runTurn: MemoryTurnRunner = runAgentTurn
): Promise<{ days: number; saved: number }> {
  const dates = pendingConsolidationDates(getMemoryConsolidatedDate(userId), new Date())
  if (dates.length > 1) {
    console.log(`[memory] catching up ${dates.length} days for ${userId}: ${dates[0]}..${dates[dates.length - 1]}`)
  }
  let saved = 0
  for (const date of dates) {
    saved += (await consolidateDayMemory(userId, date, runTurn)).saved
    setMemoryConsolidatedDate(userId, date)
  }
  return { days: dates.length, saved }
}

// ── 调度 ──────────────────────────────────────────────────

/**
 * 记忆整理子系统作业描述。
 * 每分钟检查一次到点（北京 00:30），首次延迟 30 秒等 contextStore 就绪；不需要 bot 实例。
 */
export const memoryJob: SubsystemJob = {
  name: 'memory',
  run: checkAndConsolidateMemories,
  intervalMinutes: () => 1,
  initDelayMs: 30_000,
}

/** 心跳：到点则遍历用户逐人整理（in-flight 锁防并发）。 */
export async function checkAndConsolidateMemories(): Promise<void> {
  if (!isMemoryDue(new Date())) return
  for (const userId of getWeChatUsers()) {
    try {
      // 已有同 key 任务在跑时 withInflight 返回 undefined（跳过本轮）
      await withInflight(`memory:${userId}`, () => consolidatePendingMemories(userId))
    } catch (err) {
      console.error(`[memory] consolidate failed for ${userId}:`, err)
    }
  }
}
