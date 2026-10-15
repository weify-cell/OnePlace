import { connectDatabase } from '../../database/index.js'
import { getSettingValue } from '../settings.service.js'
import { queryChatRecords, buildTranscript } from './report.service.js'
import { getWeChatUsers, getMemoryConsolidatedDate, setMemoryConsolidatedDate } from './users.service.js'
import { getILinkModel } from './model.js'
import { withInflight } from '../../utils/inflight.js'
import type { SubsystemJob } from './scheduler.js'
import { runAgentTurn, wechatTaskAgentId, type AgentTurnRequest } from '../ai/agent-turn.js'
import { buildMemoryUserContent, buildSystemPrompt } from '../ai/prompt.js'
import { resolveRecentDeviceId } from '../phone/track.service.js'
import { buildTrackSummary } from '../phone/track-summary.js'
import { formatBeijingTime, getBeijingDate, getBeijingDateAfter, getBeijingDayWindow, shiftBeijingDate, toBeijingDate } from '../../utils/time.js'
import { embedText } from '../ai/embedding-client.js'
import { upsertChunks, searchChunks, deleteChunks } from '../vector/vector.service.js'

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
  /** state=状态型（会被新值取代）/ event=事件型（随时间退场）/ null=未分类（历史数据） */
  kind: MemoryKind | null
  topic: string | null
  superseded_by: number | null
  last_hit_at: string | null
  archived_at: string | null
}

/** 写入时可选的记忆模型信息（由模型在 add_memory 时提供）。 */
export interface MemoryWriteOptions {
  /** 状态型=会被同主题的新值取代；事件型=只随时间退场 */
  kind?: MemoryKind
  /** 状态型的主题键（如「阅读进度:习惯的力量」） */
  topic?: string
}

/** 记忆类型：状态型会被同主题新值取代，事件型只随时间退场。 */
export type MemoryKind = 'state' | 'event'

/** 值是不是合法的记忆类型（模型给的值不可信，要先窄化再落库）。 */
export function isMemoryKind(value: unknown): value is MemoryKind {
  return value === 'state' || value === 'event'
}

/** 归一化写入选项：未知 kind 丢弃；状态型缺主题则告警（它不会参与取代）。 */
function normalizeWriteOptions(opts: MemoryWriteOptions): MemoryWriteOptions {
  const kind = isMemoryKind(opts.kind) ? opts.kind : undefined
  if (opts.kind && !kind) console.warn(`[memory] 未知的 kind「${opts.kind}」已忽略`)
  const topic = (opts.topic || '').trim() || undefined
  if (kind === 'state' && !topic) console.warn('[memory] 状态型记忆缺少主题键，将不参与取代')
  return { kind, topic }
}

/** 落一条记忆；UNIQUE(user_id, content) 去重。返回新插入的 id，重复返回 0。 */
export function saveMemory(
  userId: string,
  content: string,
  memoryDate: string,
  opts: MemoryWriteOptions = {}
): number {
  const db = connectDatabase()
  const result = db.prepare(
    `INSERT OR IGNORE INTO wechat_memories (user_id, content, memory_date, kind, topic) VALUES (?, ?, ?, ?, ?)`
  ).run(userId, content, memoryDate, opts.kind ?? null, opts.topic ?? null)
  // INSERT OR IGNORE 冲突时 changes=0 而 lastInsertRowid 停留在上次值，必须用 changes 判重
  return result.changes === 0 ? 0 : Number(result.lastInsertRowid)
}

/** 查询某用户记忆。days=近 N 天（含当天），按 memory_date DESC, id DESC。已归档的不再返回。 */
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
     WHERE user_id = ? AND memory_date >= ? AND archived_at IS NULL
     ORDER BY memory_date DESC, id DESC
     LIMIT ?`
  ).all(userId, since, limit) as MemoryRow[]
}

/** 列表过滤维度。 */
export type MemoryListFilter = 'all' | 'state' | 'event' | 'archived'

/**
 * 记忆列表（只读，供管理页看）。
 *
 * - `all` 是**生效中的全部**（状态型 + 事件型 + 未分类），已归档单独一档；
 * - 生效中的按记忆日期倒序，已归档的按归档时间倒序（最近退场的在上面）；
 * - 还没接的是每条的「被命中次数」与汇总比率——那些需要检索事件表（工单 02）。
 */
export function listMemories(opts: {
  userId: string
  filter?: MemoryListFilter
  page?: number
  pageSize?: number
}): { items: MemoryRow[]; total: number; page: number; pageSize: number } {
  const db = connectDatabase()
  const filter = opts.filter ?? 'all'
  const page = Math.max(opts.page ?? 1, 1)
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100)

  const conditions: string[] = ['user_id = ?']
  const values: string[] = [opts.userId]
  if (filter === 'archived') {
    conditions.push('archived_at IS NOT NULL')
  } else {
    conditions.push('archived_at IS NULL')
    if (filter === 'state') conditions.push("kind = 'state'")
    if (filter === 'event') conditions.push("kind = 'event'")
  }
  const where = conditions.join(' AND ')

  const { c: total } = db.prepare(`SELECT COUNT(*) c FROM wechat_memories WHERE ${where}`)
    .get(...values) as { c: number }
  const order = filter === 'archived' ? 'archived_at DESC, id DESC' : 'memory_date DESC, id DESC'
  const items = db.prepare(
    `SELECT * FROM wechat_memories WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`
  ).all(...values, pageSize, (page - 1) * pageSize) as MemoryRow[]

  return { items, total, page, pageSize }
}

/** 关键词检索（数据库）。已归档的不再返回。 */
export function searchMemories(
  query: string,
  opts?: { userId?: string; limit?: number }
): MemoryRow[] {
  const db = connectDatabase()
  const limit = opts?.limit ?? 10
  const conditions: string[] = ['instr(content, ?) > 0', 'archived_at IS NULL']
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

/**
 * 注入用的状态型记忆：只取未被归档的。
 *
 * 同一主题的旧值在写入时会被取代并归档；但**取代靠主题键完全相等**，而主题键由模型产出、
 * 实测并不稳定（同一件事会落在不同拼法的键上）——所以这里不能假设「每个主题只剩一条」。
 * 大小靠下面这个默认上界兜住：与键质量无关。
 * 同时回报总数：被截断时要能告诉模型「还有没列出的」，否则它会以为没列出来就不存在。
 */
function queryCurrentStateMemories(userId: string): { items: MemoryRow[]; total: number } {
  const db = connectDatabase()
  const maxItems = getSettingValue<number>('ilink_memory_prompt_max_items', 0)
  const limit = maxItems > 0 ? maxItems : DEFAULT_DIGEST_LIMIT
  const items = db.prepare(
    `SELECT * FROM wechat_memories
     WHERE user_id = ? AND kind = 'state' AND archived_at IS NULL
     ORDER BY memory_date DESC, id DESC
     LIMIT ?`
  ).all(userId, limit) as MemoryRow[]
  const { c: total } = db.prepare(
    `SELECT COUNT(*) c FROM wechat_memories WHERE user_id = ? AND kind = 'state' AND archived_at IS NULL`
  ).get(userId) as { c: number }
  return { items, total }
}

/**
 * 当前状态摘要段（system prompt 用）；无状态型记忆返回 ''。
 *
 * 只放状态型记忆的最新值（实测改造前是「近 30 天全部」，一次 169 条 / 12,897 字符）：
 * 事件型与未分类的历史数据都不常驻提示词，需要翻旧账时由模型自己调检索工具——
 * 该不该捞那条旧记忆，本来就该由模型决定，不该每轮替它做（见 ADR-0002）。
 * 每条带主题键（模型下次要改这条时会用同一个键）与记录日期（状态可能已经旧了）。
 */
export function buildMemoryPrompt(userId: string): string {
  const { items, total } = queryCurrentStateMemories(userId)
  if (items.length === 0) return ''
  const lines = items.map(m => `- ${m.topic ? `${m.topic}：` : ''}${m.content}（${m.memory_date}）`)
  const omitted = total - items.length
  return [
    '## 记忆（当前状态）',
    ...lines,
    ...(omitted > 0 ? [`（另有 ${omitted} 条更早的状态记忆未列出，需要时用 search_memory 检索）`] : []),
    '需要回忆更早的事时，调用 search_memory（关键词）或 search_memory_vectors（语义）工具检索即可，不需要传用户 ID。'
  ].join('\n')
}

// ── 向量存取 ──────────────────────────────────────────────

/** 记忆向量库 collection 名（独立于笔记知识库）。 */
function getMemoryCollection(): string {
  return getSettingValue<string>('qdrant_memory_collection', 'oneplace_memory')
}

/**
 * 记忆点在向量库里的 id。
 *
 * 写入与删除必须同源：两边各写一遍格式，删的时候就会删不掉（那是这套代码里
 * 已经出现过两次的缺陷类型——写入端只增不删）。
 */
function memoryPointId(memoryId: number): string {
  return `mem${memoryId}`
}

/** 清掉若干条记忆的向量。失败只记日志：归档已经落库，不该被向量库拖住。 */
async function deleteMemoryVectors(memoryIds: number[]): Promise<void> {
  if (memoryIds.length === 0) return
  try {
    await deleteChunks(memoryIds.map(memoryPointId), getMemoryCollection())
  } catch (err) {
    console.error('[memory] vector delete failed:', err)
  }
}

/** 归档/清向量时每批处理多少条 */
const ARCHIVE_BATCH = 500

/** 给单条记忆条目 embedding 并写入记忆向量库。 */
async function upsertMemoryVector(userId: string, memoryId: number, content: string, memoryDate: string): Promise<void> {
  const provider = getSettingValue<string>('embedding_provider', 'qwen')
  const model = getSettingValue<string>('embedding_model', 'text-embedding-v4')
  const vector = await embedText(content, provider, model)
  const result = await upsertChunks([{
    id: memoryPointId(memoryId),
    vector,
    content,
    metadata: { memory_id: memoryId, user_id: userId, memory_date: memoryDate }
  }], getMemoryCollection())
  if (!result.success) throw new Error(result.error || 'memory vector upsert failed')
}

/**
 * 归档若干条记忆（不物理删行）并清掉它们的向量。取代与退场共用这一个原语。
 * `supersededBy` 非空表示「这组记忆是被那条新记忆取代的」，空表示按年龄退场。
 * 分批处理：一次拼接上万个 id 既撑请求体，也逼近 SQLite 的绑定变量上限。
 */
async function archiveMemories(ids: number[], supersededBy: number | null = null): Promise<number> {
  if (ids.length === 0) return 0
  const db = connectDatabase()
  const archivedAt = new Date().toISOString()
  for (let i = 0; i < ids.length; i += ARCHIVE_BATCH) {
    const batch = ids.slice(i, i + ARCHIVE_BATCH)
    db.prepare(
      `UPDATE wechat_memories SET archived_at = ?, superseded_by = ?
       WHERE id IN (${batch.map(() => '?').join(',')})`
    ).run(archivedAt, supersededBy, ...batch)
    await deleteMemoryVectors(batch)
  }
  return ids.length
}

/**
 * 让某主题只剩最新的那条活跃状态值：较旧的全部归档（不删行）并清掉向量。
 *
 * 正常写入与「给历史记忆补类型」都走这里——于是「一个主题一个当前值」这条不变式只有一处定义。
 * 保留的是**按 (memory_date, id) 最新的那条**，而不是「刚写进来的那条」：
 * 补标注时进来的那条往往很旧，不能因为它刚被认领就把更新的当前值挤下去。
 */
async function keepNewestStateFor(userId: string, topic: string): Promise<number> {
  const rows = connectDatabase().prepare(
    `SELECT id FROM wechat_memories
     WHERE user_id = ? AND topic = ? AND kind = 'state' AND archived_at IS NULL
     ORDER BY memory_date DESC, id DESC`
  ).all(userId, topic) as Array<{ id: number }>
  if (rows.length <= 1) return 0
  return archiveMemories(rows.slice(1).map(r => r.id), rows[0].id)
}

/**
 * 同一内容已存在、且现有那条还没有类型时，就地把类型与主题补上（同内容的历史记忆补标注）。
 *
 * 没有这一步，「未归档的同内容行」永远拿不到类型：写入命中 UNIQUE 后返回 duplicate，
 * 而复活只会顺手处理**已归档**的行。补的是元数据不是事实，因此不动 memory_date/created_at。
 * 返回被补写的那条 id；不需要补时返回 0。
 */
function upgradeMemoryMetadata(
  userId: string,
  content: string,
  opts: { kind?: MemoryKind; topic?: string }
): number {
  if (!opts.kind) return 0
  const db = connectDatabase()
  const row = db.prepare(
    `SELECT id, kind FROM wechat_memories
     WHERE user_id = ? AND content = ? AND archived_at IS NULL`
  ).get(userId, content) as { id: number; kind: MemoryKind | null } | undefined
  if (!row || row.kind) return 0
  db.prepare('UPDATE wechat_memories SET kind = ?, topic = ? WHERE id = ?')
    .run(opts.kind, opts.topic ?? null, row.id)
  return row.id
}

/**
 * 同一内容的历史记忆已被归档（被取代或已退场）时，让它重新成为当前记忆。
 *
 * 没有这一步，`UNIQUE(user_id, content)` 会把这条重新出现的事实静默吞掉：
 * 写入返回 duplicate，而库里那条早已归档、检索也不可见。
 * kind/topic 作为一对更新（给了 kind 就用新的那对，没给就两个都保持原样，
 * 否则会出现 kind='event' 却留着状态型旧主题的鬼记录）；
 * created_at 与 last_hit_at 一起重置为「重新计龄」——否则它会被旧命中时间立即再退场一次。
 */
function reviveMemory(
  userId: string,
  content: string,
  opts: { kind?: MemoryKind; topic?: string; memoryDate: string }
): number {
  const db = connectDatabase()
  const row = db.prepare(
    `SELECT id, kind, topic FROM wechat_memories WHERE user_id = ? AND content = ? AND archived_at IS NOT NULL`
  ).get(userId, content) as { id: number; kind: MemoryKind | null; topic: string | null } | undefined
  if (!row) return 0
  const kind = opts.kind ?? row.kind
  const topic = opts.kind ? (opts.topic ?? null) : row.topic
  db.prepare(
    `UPDATE wechat_memories
     SET archived_at = NULL, superseded_by = NULL, memory_date = ?, created_at = ?, last_hit_at = NULL,
         kind = ?, topic = ?
     WHERE id = ?`
  ).run(opts.memoryDate, new Date().toISOString(), kind, topic, row.id)
  return row.id
}

/** 内容最短长度：低于此长度的内容不是「一句完整、独立、可检索的话」 */
const MIN_CONTENT_LENGTH = 2

/**
 * 摘要的默认上界（条）。
 *
 * 意义在于：摘要大小与「模型产出的主题键是否稳定」这件事**脱钩**——
 * 取代靠键完全相等，拼法不一致就不会收敛，于是必须有另一道硬性上界。
 * 设置里给了正数就用设置值；给 0 或未设置则用这个默认上界（而不是不限）。
 */
export const DEFAULT_DIGEST_LIMIT = 10

/**
 * 单条记忆写入口（add_memory 工具调用）：落库→新增才写向量。
 *
 * 对话中的即时写入与每晚整理都走这里——校验、归一化、去重、取代只此一处，
 * 不在工具层再抄一份（抄两份就会有一份先腐）。
 * 返回 `invalid` 表示内容不合格（空白、过短，或去掉 ID 痕迹后所剩无几）。
 */
export async function addMemory(
  userId: string,
  content: string,
  memoryDate: string,
  opts: MemoryWriteOptions = {}
): Promise<{
  /** new=新写入（含复活/补标注后成为当前值）；updated=给已有行补上类型与主题；duplicate=同内容已存在且无需改动；invalid=内容不合格 */
  status: 'new' | 'updated' | 'duplicate' | 'invalid'
  /** 向量是否写成功；`updated` 也会真的写一次（内容虽未变，但会顺便确认向量存在） */
  vectorOk: boolean
  memoryId: number
  /** 本次归档了几条同主题的旧值 */
  superseded: number
  /** 本条是否成了该主题的当前值；false 表示它已如实归档（同主题已有更新的值） */
  becameCurrent: boolean
}> {
  const cleaned = stripUserIds((content || '').trim(), userId)
  if (cleaned.length < MIN_CONTENT_LENGTH) {
    return { status: 'invalid', vectorOk: false, memoryId: 0, superseded: 0, becameCurrent: false }
  }
  const { kind, topic } = normalizeWriteOptions(opts)

  const id = saveMemory(userId, cleaned, memoryDate, { kind, topic })
  if (id > 0) {
    const after = await ensureCurrent(userId, id, cleaned, memoryDate)
    return { status: 'new', memoryId: id, ...after }
  }

  // 同内容已存在：先看能不能补类型（历史记忆补标注），已归档的才走复活，两者都不是则重复
  const upgradedId = upgradeMemoryMetadata(userId, cleaned, { kind, topic })
  if (upgradedId > 0) {
    const after = await ensureCurrent(userId, upgradedId, cleaned, memoryDate)
    return { status: 'updated', memoryId: upgradedId, ...after }
  }
  const revivedId = reviveMemory(userId, cleaned, { kind, topic, memoryDate })
  if (revivedId === 0) {
    return { status: 'duplicate', vectorOk: false, memoryId: 0, superseded: 0, becameCurrent: true }
  }
  const after = await ensureCurrent(userId, revivedId, cleaned, memoryDate)
  return { status: 'new', memoryId: revivedId, ...after }
}

/**
 * 让某条记忆就位：写它的向量，并按库里**实际存着的**类型与主题把
 * 「一个主题只留一个当前值（按 memory_date 最新的那条）」这条不变式执行一遍。
 *
 * 从库里读而不是用调用方传的值：复活与补标注路径会保留行上原有的类型，
 * 按调用方参数判断就会漏掉「复活一条旧状态型行」那种情况，留下两个当前值。
 * 写入与归档的顺序也在这里定下：先写新向量，再归档旧值（旧值归档时会删它自己的向量）。
 */
async function ensureCurrent(
  userId: string,
  memoryId: number,
  content: string,
  memoryDate: string
): Promise<{ vectorOk: boolean; superseded: number; becameCurrent: boolean }> {
  let vectorOk = true
  try {
    await upsertMemoryVector(userId, memoryId, content, memoryDate)
  } catch (err) {
    vectorOk = false
    console.error(`[memory] vector upsert failed for memory #${memoryId}:`, err)
  }

  const db = connectDatabase()
  const row = db.prepare('SELECT kind, topic FROM wechat_memories WHERE id = ?')
    .get(memoryId) as { kind: MemoryKind | null; topic: string | null } | undefined
  if (row?.kind !== 'state' || !row.topic) return { vectorOk, superseded: 0, becameCurrent: true }

  const superseded = await safeKeepNewest(userId, row.topic)
  const still = db.prepare('SELECT archived_at FROM wechat_memories WHERE id = ?')
    .get(memoryId) as { archived_at: string | null } | undefined
  return { vectorOk, superseded, becameCurrent: !still?.archived_at }
}

/** 归档业务是尽最大努力的后台清理（失败只记日志），不因它让写入报错。 */
async function safeKeepNewest(userId: string, topic: string): Promise<number> {
  try {
    return await keepNewestStateFor(userId, topic)
  } catch (err) {
    console.error(`[memory] supersede failed for topic「${topic}」:`, err)
    return 0
  }
}

/** 语义检索记忆向量库；失败返回空数组（不阻断对话）。已归档的记忆不返回。 */
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
    const mapped = results.map(r => {
      const p = r.payload as { memory_id?: number; content?: string; memory_date?: string }
      return {
        memory_id: p.memory_id ?? 0,
        content: p.content ?? '',
        memory_date: p.memory_date ?? '',
        score: r.score
      }
    })
    // 兜底：向量可能还没被清掉（清向量失败、或历史遗留），按库中真实状态过滤一次，
    // 否则已归档的记忆会继续被搜出来——这正是笔记那边发生过的孤儿向量问题。
    const live = liveMemoryIds(mapped.map(r => r.memory_id))
    return mapped.filter(r => live.has(r.memory_id))
  } catch (err) {
    console.error('[memory] vector search failed:', err)
    return []
  }
}

/** 给出的记忆 id 里，哪些还在生效（未被归档）。 */
function liveMemoryIds(ids: number[]): Set<number> {
  const wanted = ids.filter(id => Number.isInteger(id) && id > 0)
  if (wanted.length === 0) return new Set()
  const rows = connectDatabase().prepare(
    `SELECT id FROM wechat_memories WHERE archived_at IS NULL AND id IN (${wanted.map(() => '?').join(',')})`
  ).all(...wanted) as Array<{ id: number }>
  return new Set(rows.map(r => r.id))
}

// ── 退场（长期未被命中的事件型记忆） ──────────────────────

/** 事件型记忆的退场年龄：超过这些天没被命中过就归档。 */
export const RETIRE_AFTER_DAYS = 180

/**
 * 退场：长期未被命中的事件型记忆归档（不物理删行），并清掉它们的向量。
 *
 * 认龄时间取 `coalesce(last_hit_at, created_at)`：没有命中记录就等于「从未被命中」，
 * 因此不需要先有命中统计（工单 02）才能做这件事——02 落地后本规则自动升级成
 *「最近一次命中已过去 180 天」，这里不必再改。
 *
 * 不参与退场的两类：状态型（它们靠被同主题新值取代退场）、未分类的历史数据。
 */
export async function retireExpiredMemories(now: Date = new Date()): Promise<{ retired: number }> {
  const db = connectDatabase()
  const cutoff = new Date(now.getTime() - RETIRE_AFTER_DAYS * 86400000).toISOString()
  // 先查再归档：向量删除需要 id，而归档本身走 archiveMemories（内含分批）
  const ids = (db.prepare(
    `SELECT id FROM wechat_memories
     WHERE kind = 'event' AND archived_at IS NULL AND coalesce(last_hit_at, created_at) < ?`
  ).all(cutoff) as Array<{ id: number }>).map(r => r.id)
  const retired = await archiveMemories(ids)
  if (retired > 0) console.log(`[memory] retired ${retired} expired event memories`)
  return { retired }
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
  // 手机轨迹也是素材：一天没聊天但出了门（规律、常去地点的变化）同样值得记
  const deviceId = resolveRecentDeviceId()
  const trackSummary = deviceId ? buildTrackSummary(deviceId, memoryDate) : ''
  if (records.length === 0 && !trackSummary) {
    console.log(`[memory] no messages and no track on ${memoryDate} for ${userId}, skip`)
    return { saved: 0 }
  }

  const recentMemories = queryMemories(userId, { days: 30, limit: 500 })
  // 已有记忆要带上类型与主题键：模型得看到同主题键的原写法，否则每晚都会发明新拼法，
  // 取代就永远触发不了（同一个主题会被当成两个）
  const recentLines = recentMemories.map(m => {
    const label = m.kind === 'state' && m.topic ? `[状态型|${m.topic}]` : m.kind === 'event' ? '[事件型]' : '[未分类]'
    return `- ${label} ${m.content}`
  })
  // 提示词与用户消息模板均由 ai/prompt.ts 统一解析（设置优先，回退唯一默认值）
  const systemPrompt = await buildSystemPrompt({ kind: 'memory' })
  const userContent = buildMemoryUserContent({
    beijingTime: formatBeijingTime(),
    userId,
    memoryDate,
    recordCount: String(records.length),
    transcript: buildTranscript(records),
    recentMemories: recentLines.length > 0
      ? `\n以下为已有记忆（含类型与主题键），请勿重复抽取；状态型请沿用同一主题键：\n${recentLines.join('\n')}`
      : ''
  }, trackSummary)

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

/** 心跳：到点则遍历用户逐人整理（in-flight 锁防并发），末尾做一次全局退场。 */
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
  // 退场与用户无关（一条记忆只有一条归属），一轮跑一次即可
  try {
    await retireExpiredMemories()
  } catch (err) {
    console.error('[memory] retire failed:', err)
  }
}
