import { beforeEach, describe, expect, it, vi } from 'vitest'

// 真库 + 真迁移（含 029 的五个新列）
vi.mock('../database/index.js', async () => {
  const { connectDatabase } = await import('./helpers/test-db.js')
  return { connectDatabase }
})

// 只 mock 外部系统：embedding 服务与向量库
vi.mock('../services/ai/embedding-client.js', () => ({
  embedText: vi.fn(async () => [0.1, 0.2, 0.3])
}))
vi.mock('../services/vector/vector.service.js', () => ({
  upsertChunks: vi.fn(async () => ({ success: true, count: 1 })),
  searchChunks: vi.fn(async () => []),
  deleteChunks: vi.fn(async () => undefined)
}))

import { connectDatabase } from '../database/index.js'
import { setSetting } from '../services/settings.service.js'
import {
  addMemory,
  buildMemoryPrompt,
  queryMemories,
  searchMemories,
  searchMemoryVectors,
  retireExpiredMemories
} from '../services/wechat/memory.service.js'

const USER = 'u1'
const NOW = new Date('2026-10-12T04:30:00.000Z')
const DAY = 86400000

function isoDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString()
}

function dateDaysAgo(days: number): string {
  return isoDaysAgo(days).slice(0, 10)
}

interface Row {
  id: number
  kind: string | null
  topic: string | null
  archived_at: string | null
  superseded_by: number | null
  last_hit_at: string | null
  content: string
}

function allRows(): Row[] {
  return connectDatabase()
    .prepare('SELECT id, kind, topic, archived_at, superseded_by, last_hit_at, content FROM wechat_memories ORDER BY id')
    .all() as Row[]
}

function rowById(id: number): Row {
  return allRows().find(r => r.id === id)!
}

/** 直接落一条历史记忆（可指定创建时间与命中时间，用于退场判定） */
function seed(row: {
  content: string
  createdAt: string
  kind?: 'state' | 'event' | null
  topic?: string | null
  lastHitAt?: string | null
  userId?: string
}): number {
  const db = connectDatabase()
  const res = db.prepare(
    `INSERT INTO wechat_memories (user_id, content, memory_date, created_at, kind, topic, last_hit_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(row.userId ?? USER, row.content, row.createdAt.slice(0, 10), row.createdAt,
        row.kind ?? null, row.topic ?? null, row.lastHitAt ?? null)
  return Number(res.lastInsertRowid)
}

beforeEach(() => {
  const db = connectDatabase()
  db.prepare('DELETE FROM wechat_memories').run()
  db.prepare('DELETE FROM settings').run()
})

describe('写入：类型与主题', () => {
  it('状态型记忆带上 kind 与 topic 落库', async () => {
    await addMemory(USER, '用户的《习惯的力量》阅读进度为75%', dateDaysAgo(0), {
      kind: 'state',
      topic: '阅读进度:习惯的力量'
    })
    const [row] = allRows()
    expect(row).toMatchObject({ kind: 'state', topic: '阅读进度:习惯的力量', archived_at: null })
  })

  it('同一主题的新状态值取代旧值：旧值被归档并记下被谁取代，且不物理删行', async () => {
    const first = await addMemory(USER, '阅读进度 75%', dateDaysAgo(2), {
      kind: 'state', topic: '阅读进度:习惯的力量'
    })
    const second = await addMemory(USER, '阅读进度 85%', dateDaysAgo(0), {
      kind: 'state', topic: '阅读进度:习惯的力量'
    })

    expect(allRows()).toHaveLength(2) // 归档不删行
    expect(rowById(first.memoryId)).toMatchObject({
      archived_at: expect.any(String),
      superseded_by: second.memoryId
    })
    expect(rowById(second.memoryId).archived_at).toBeNull()
  })

  it('不同主题的状态值互不取代', async () => {
    await addMemory(USER, '阅读进度 75%', dateDaysAgo(2), { kind: 'state', topic: '阅读进度:习惯的力量' })
    await addMemory(USER, '冥想固定在每天12:50', dateDaysAgo(0), { kind: 'state', topic: '习惯:冥想时间' })
    expect(allRows().every(r => r.archived_at === null)).toBe(true)
  })

  it('取代只影响同一用户的同类记忆', async () => {
    const other = await addMemory('u2', '阅读进度 75%', dateDaysAgo(2), {
      kind: 'state', topic: '阅读进度:习惯的力量'
    })
    await addMemory(USER, '阅读进度 85%', dateDaysAgo(0), { kind: 'state', topic: '阅读进度:习惯的力量' })
    expect(rowById(other.memoryId).archived_at).toBeNull()
  })

  it('事件型不参与取代：同主题两条都留下', async () => {
    await addMemory(USER, '用户 9-20 体检', dateDaysAgo(20), { kind: 'event', topic: '体检' })
    await addMemory(USER, '用户 10-11 复诊', dateDaysAgo(1), { kind: 'event', topic: '体检' })
    expect(allRows().every(r => r.archived_at === null)).toBe(true)
  })

  it('未分类的历史记忆不参与取代（kind 为 NULL）', async () => {
    const legacy = seed({ content: '阅读进度 75%', createdAt: isoDaysAgo(3), topic: '阅读进度:习惯的力量' })
    await addMemory(USER, '阅读进度 85%', dateDaysAgo(0), { kind: 'state', topic: '阅读进度:习惯的力量' })
    expect(rowById(legacy).archived_at).toBeNull()
  })

  it('同一内容在被归档后再次出现 → 重新成为当前记忆（不被 UNIQUE 静默吞掉）', async () => {
    const first = await addMemory(USER, '阅读进度 75%', dateDaysAgo(2), {
      kind: 'state', topic: '阅读进度:习惯的力量'
    })
    await addMemory(USER, '阅读进度 85%', dateDaysAgo(1), { kind: 'state', topic: '阅读进度:习惯的力量' })
    expect(rowById(first.memoryId).archived_at).not.toBeNull()

    const again = await addMemory(USER, '阅读进度 75%', dateDaysAgo(0), {
      kind: 'state', topic: '阅读进度:习惯的力量'
    })

    expect(again.status).toBe('new')
    expect(allRows()).toHaveLength(2)
    expect(rowById(first.memoryId)).toMatchObject({ archived_at: null, superseded_by: null })
  })
})

describe('检索：归档的不再出现', () => {
  it('queryMemories 与 searchMemories 都不返回被取代的记忆', async () => {
    await addMemory(USER, '阅读进度 75%', dateDaysAgo(2), { kind: 'state', topic: '阅读进度:习惯的力量' })
    await addMemory(USER, '阅读进度 85%', dateDaysAgo(0), { kind: 'state', topic: '阅读进度:习惯的力量' })

    const queried = queryMemories(USER, { days: 30 }).map(r => r.content)
    expect(queried).toEqual(['阅读进度 85%'])
    expect(searchMemories('阅读进度', { userId: USER }).map(r => r.content)).toEqual(['阅读进度 85%'])
  })

  it('未分类的历史记忆仍可被检索命中', () => {
    seed({ content: '用户家里有一台单车机', createdAt: isoDaysAgo(40) })
    expect(queryMemories(USER, { days: 400 }).map(r => r.content)).toContain('用户家里有一台单车机')
    expect(searchMemories('单车机', { userId: USER })).toHaveLength(1)
  })

  it('向量检索结果里已归档的记忆被过滤掉（向量可能还没清干净）', async () => {
    const live = seed({ content: '用户睡前跑五公里', createdAt: isoDaysAgo(1) })
    const archived = seed({ content: '用户以前说每天跑三公里', createdAt: isoDaysAgo(9) })
    connectDatabase().prepare('UPDATE wechat_memories SET archived_at = ? WHERE id = ?')
      .run(isoDaysAgo(0), archived)

    const { searchChunks } = await import('../services/vector/vector.service.js')
    vi.mocked(searchChunks).mockResolvedValueOnce([
      { id: `mem${live}`, score: 0.9, payload: { memory_id: live, content: '用户睡前跑五公里', memory_date: '2026-10-11' } },
      { id: `mem${archived}`, score: 0.8, payload: { memory_id: archived, content: '用户以前说每天跑三公里', memory_date: '2026-10-03' } }
    ])

    const results = await searchMemoryVectors('跑步', { userId: USER })
    expect(results.map(r => r.memory_id)).toEqual([live])
  })
})

describe('注入段：只带状态型的最新值', () => {
  it('状态型记忆进注入，并带上主题键', async () => {
    await addMemory(USER, '用户《习惯的力量》阅读进度 85%', dateDaysAgo(0), {
      kind: 'state', topic: '阅读进度:习惯的力量'
    })
    const prompt = buildMemoryPrompt(USER)
    expect(prompt).toContain('## 记忆（当前状态）')
    expect(prompt).toContain('阅读进度:习惯的力量')
    expect(prompt).toContain('阅读进度 85%')
  })

  it('事件型不进注入（它们按需检索，不常驻提示词）', async () => {
    await addMemory(USER, '用户 10-11 去体检了', dateDaysAgo(1), { kind: 'event' })
    expect(buildMemoryPrompt(USER)).toBe('')
  })

  it('未分类的历史记忆不进注入（但仍可被检索）', async () => {
    seed({ content: '用户家里有一台单车机', createdAt: isoDaysAgo(5) })
    expect(queryMemories(USER, { days: 30 })).toHaveLength(1)
    expect(buildMemoryPrompt(USER)).toBe('')
  })

  it('被取代的旧值不进注入', async () => {
    await addMemory(USER, '阅读进度 75%', dateDaysAgo(2), { kind: 'state', topic: '阅读进度:习惯的力量' })
    await addMemory(USER, '阅读进度 85%', dateDaysAgo(0), { kind: 'state', topic: '阅读进度:习惯的力量' })
    const prompt = buildMemoryPrompt(USER)
    expect(prompt).toContain('阅读进度 85%')
    expect(prompt).not.toContain('阅读进度 75%')
  })

  it('量级：两百条未分类噪声也不影响注入，注入只含那几条状态型', async () => {
    for (let i = 0; i < 200; i++) {
      seed({ content: `历史噪声 ${i}`, createdAt: isoDaysAgo(i % 20) })
    }
    await addMemory(USER, '阅读进度 85%', dateDaysAgo(0), { kind: 'state', topic: '阅读进度:习惯的力量' })
    await addMemory(USER, '冥想固定在每天 12:50', dateDaysAgo(0), { kind: 'state', topic: '习惯:冥想时间' })

    const lines = buildMemoryPrompt(USER).split('\n').filter(l => l.startsWith('- '))
    expect(lines).toHaveLength(2)
  })

  it('没有状态型记忆时不产生注入段', () => {
    expect(buildMemoryPrompt(USER)).toBe('')
  })

  it('每条带主题键与记录日期（状态可能已经旧了，模型要看得出来）', async () => {
    await addMemory(USER, '用户《习惯的力量》阅读进度 85%', '2026-06-01', {
      kind: 'state', topic: '阅读进度:习惯的力量'
    })
    const prompt = buildMemoryPrompt(USER)
    expect(prompt).toContain('阅读进度:习惯的力量')
    expect(prompt).toContain('（2026-06-01）')
  })

  it('超过条目上限时告知模型还有未列出的（否则它会以为没列出来就不存在）', async () => {
    setSetting('ilink_memory_prompt_max_items', 2)
    await addMemory(USER, '进度 A', dateDaysAgo(3), { kind: 'state', topic: 'T:A' })
    await addMemory(USER, '进度 B', dateDaysAgo(2), { kind: 'state', topic: 'T:B' })
    await addMemory(USER, '进度 C', dateDaysAgo(1), { kind: 'state', topic: 'T:C' })

    const prompt = buildMemoryPrompt(USER)
    expect(prompt.split('\n').filter(l => l.startsWith('- '))).toHaveLength(2)
    expect(prompt).toContain('另有 1 条')
  })
})

describe('退场：长期未被命中的事件型记忆归档', () => {
  it('从未被命中时按创建日计龄：超过 180 天的事件型被归档，并清掉它的向量', async () => {
    const old = seed({ content: '用户 2026-04-01 去过一次医院', createdAt: isoDaysAgo(200), kind: 'event' })
    const fresh = seed({ content: '用户 10-11 复诊', createdAt: isoDaysAgo(10), kind: 'event' })

    const { deleteChunks } = await import('../services/vector/vector.service.js')
    vi.mocked(deleteChunks).mockClear()

    const res = await retireExpiredMemories(NOW)

    expect(res.retired).toBe(1)
    expect(rowById(old).archived_at).not.toBeNull()
    expect(rowById(old).superseded_by).toBeNull() // 退场不是被取代
    expect(rowById(fresh).archived_at).toBeNull()
    expect(deleteChunks).toHaveBeenCalledWith([`mem${old}`], 'oneplace_memory')
  })

  it('最近命中过的事件型即使创建很早也不归档（认龄时间取 last_hit_at）', () => {
    const hitRecently = seed({
      content: '用户 2025-12-02 体检过', createdAt: isoDaysAgo(300), kind: 'event', lastHitAt: isoDaysAgo(10)
    })
    return expect(retireExpiredMemories(NOW)).resolves.toMatchObject({ retired: 0 })
      .then(() => expect(rowById(hitRecently).archived_at).toBeNull())
  })

  it('状态型不按年龄退场（它们靠"被取代"退场）', async () => {
    const stale = seed({
      content: '用户阅读进度 30%', createdAt: isoDaysAgo(300), kind: 'state', topic: '阅读进度:习惯的力量'
    })
    await expect(retireExpiredMemories(NOW)).resolves.toMatchObject({ retired: 0 })
    expect(rowById(stale).archived_at).toBeNull()
  })

  it('未分类的历史记忆不参与退场', async () => {
    const legacy = seed({ content: '用户 2026-04-01 的老记忆', createdAt: isoDaysAgo(300) })
    await expect(retireExpiredMemories(NOW)).resolves.toMatchObject({ retired: 0 })
    expect(rowById(legacy).archived_at).toBeNull()
  })

  it('向量清理失败不阻断归档（归档先落库）', async () => {
    const old = seed({ content: '用户 2026-04-01 去过一次医院', createdAt: isoDaysAgo(200), kind: 'event' })
    const { deleteChunks } = await import('../services/vector/vector.service.js')
    vi.mocked(deleteChunks).mockRejectedValueOnce(new Error('qdrant down'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(retireExpiredMemories(NOW)).resolves.toMatchObject({ retired: 1 })

    expect(rowById(old).archived_at).not.toBeNull()
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
