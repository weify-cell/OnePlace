import { describe, expect, it, vi } from 'vitest'

vi.mock('../database/index.js', async () => {
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE wechat_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      memory_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, content)
    );
    CREATE TABLE wechat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `)
  return { connectDatabase: () => db }
})

// Task 4：mock ilink-bot 的动态 import（consolidateDayMemory 内部运行时 await import()）
// 模拟真实 agent 行为：整理时对每条抽取结果调用一次 add_memory 工具写入
vi.doMock('../services/wechat/ilink-bot.service.js', () => ({
  runAgentTurn: vi.fn(async (opts: any) => {
    const md = getMemoryDate(new Date(Date.now() - 86400000)) // 昨天
    await addMemory(opts.userId, '用户喜欢喝美式', md)
    await addMemory(opts.userId, '项目A正在开发', md)
    return ''
  }),
  formatBeijingTime: vi.fn(() => '[2026-08-02 00:30:00 星期日 北京时间]')
}))

vi.mock('../services/ai/embedding-client.js', () => ({
  embedText: vi.fn(async () => [0.1, 0.2, 0.3])
}))
vi.mock('../services/vector/vector.service.js', () => ({
  upsertChunks: vi.fn(async () => ({ success: true, count: 1 })),
  searchChunks: vi.fn(async () => [])
}))

import { connectDatabase } from '../database/index.js'
import {
  isMemoryDue, getMemoryDate, saveMemory, queryMemories,
  searchMemories, addMemory, buildMemoryPrompt
} from '../services/wechat/memory.service.js'
import { getReportWindow } from '../services/wechat/report.service.js'

describe('isMemoryDue', () => {
  const DUE_830 = new Date('2026-08-01T16:30:00.000Z')   // 北京 8-02 00:30
  const DUE_831 = new Date('2026-08-01T16:31:00.000Z')   // 北京 8-02 00:31（容忍）
  const OFF_832 = new Date('2026-08-01T16:32:00.000Z')   // 北京 8-02 00:32
  const OFF_800 = new Date('2026-08-01T16:00:00.000Z')   // 北京 8-02 00:00
  const OFF_100 = new Date('2026-08-01T17:00:00.000Z')   // 北京 8-02 01:00

  it('北京 00:30 到点，00:31 容忍，00:32 不再触发', () => {
    expect(isMemoryDue(DUE_830)).toBe(true)
    expect(isMemoryDue(DUE_831)).toBe(true)
    expect(isMemoryDue(OFF_832)).toBe(false)
    expect(isMemoryDue(OFF_800)).toBe(false)
    expect(isMemoryDue(OFF_100)).toBe(false)
  })
})

describe('getMemoryDate', () => {
  it('返回北京 YYYY-MM-DD', () => {
    expect(getMemoryDate(new Date('2026-08-01T16:30:00.000Z'))).toBe('2026-08-02') // 北京 00:30
    expect(getMemoryDate(new Date('2026-07-31T16:00:00.000Z'))).toBe('2026-08-01') // 北京 00:00
    expect(getMemoryDate(new Date('2026-08-02T14:00:00.000Z'))).toBe('2026-08-02') // 北京 22:00
  })
})

describe('saveMemory', () => {
  it('落表返回新 id；(user, content) 去重返回 0', () => {
    const db = connectDatabase()
    const id1 = saveMemory('u1', '用户喝美式', '2026-08-01')
    const id2 = saveMemory('u1', '用户喝美式', '2026-08-02') // 同内容 → 去重
    const id3 = saveMemory('u1', '项目A在开发', '2026-08-01')
    expect(id1).toBeGreaterThan(0)
    expect(id2).toBe(0)
    expect(id3).toBeGreaterThan(0)
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_memories').get()).toMatchObject({ c: 2 })
  })
})

describe('queryMemories', () => {
  it('近 N 天过滤 + 用户隔离', () => {
    const now = new Date()
    saveMemory('u1', '三十天前的事', getMemoryDate(new Date(now.getTime() - 30 * 86400000)))
    saveMemory('u1', '最近的事', getMemoryDate(now))
    saveMemory('u2', '别人的事', getMemoryDate(now))
    const rows = queryMemories('u1', { days: 30 })
    expect(rows.map(r => r.content)).toContain('最近的事')
    expect(rows.map(r => r.content)).not.toContain('三十天前的事')
    expect(rows.every(r => r.user_id === 'u1')).toBe(true)
  })
})

describe('searchMemories', () => {
  it('关键词 + 用户过滤', () => {
    const today = getMemoryDate(new Date())
    saveMemory('u1', '用户喝美式咖啡', today)
    saveMemory('u1', '项目A进入测试阶段', today)
    saveMemory('u2', '用户喝拿铁', today)
    const rows = searchMemories('美式', { userId: 'u1' })
    expect(rows.map(r => r.content)).toContain('用户喝美式咖啡')
    expect(rows.map(r => r.content)).not.toContain('用户喝拿铁')
    expect(searchMemories('美式')).toHaveLength(2)
  })
})

describe('addMemory', () => {
  it('新增：落库并写向量，返回 new + vectorOk=true', async () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM wechat_memories').run()
    const { upsertChunks } = await import('../services/vector/vector.service.js')
    upsertChunks.mockClear()
    const res = await addMemory('u1', '用户喝美式', '2026-08-01')
    expect(res.status).toBe('new')
    expect(res.vectorOk).toBe(true)
    expect(res.memoryId).toBeGreaterThan(0)
    expect(upsertChunks).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({
        id: `mem${res.memoryId}`,
        metadata: expect.objectContaining({ memory_id: res.memoryId, user_id: 'u1', memory_date: '2026-08-01' })
      })]),
      'oneplace_memory'
    )
  })

  it('重复：返回 duplicate 且不写向量', async () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM wechat_memories').run()
    const { upsertChunks } = await import('../services/vector/vector.service.js')
    upsertChunks.mockClear()
    await addMemory('u1', '用户喝美式', '2026-08-01')
    upsertChunks.mockClear()
    const res = await addMemory('u1', '用户喝美式', '2026-08-02') // 同内容不同日期 → 去重
    expect(res.status).toBe('duplicate')
    expect(upsertChunks).not.toHaveBeenCalled()
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_memories').get()).toMatchObject({ c: 1 })
  })

  it('向量写入失败：仍落库，返回 new + vectorOk=false', async () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM wechat_memories').run()
    const { upsertChunks } = await import('../services/vector/vector.service.js')
    upsertChunks.mockClear()
    upsertChunks.mockRejectedValueOnce(new Error('qdrant down'))
    const res = await addMemory('u1', '项目A在开发', '2026-08-01')
    expect(res.status).toBe('new')
    expect(res.vectorOk).toBe(false)
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_memories').get()).toMatchObject({ c: 1 })
  })
})

describe('buildMemoryPrompt', () => {
  it('近30天附记包含记忆与用户ID；无记忆返回空串', () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM wechat_memories').run()
    saveMemory('u1', '用户喝美式', getMemoryDate(new Date()))
    const p = buildMemoryPrompt('u1')
    expect(p).toContain('## 记忆（近30天）')
    expect(p).toContain('当前用户微信ID：u1')
    expect(p).toContain('用户喝美式')
    expect(buildMemoryPrompt('u2')).toBe('')
  })
})

import { consolidateDayMemory, searchMemoryVectors } from '../services/wechat/memory.service.js'

describe('consolidateDayMemory', () => {
  it('抽取→落库→向量入库，二次整理同内容去重', async () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM wechat_messages').run()
    db.prepare('DELETE FROM wechat_memories').run()
    // 插入「昨天」窗口内的时间戳（昨天北京 12:00）：整理窗口为 [昨天北京00:00, 今天北京00:00)，
    // 用窗口内中点可避免同毫秒 / 跨天边界被 queryChatRecords 的严格 created_at < end 排除（间歇性 flake）
    const todayStart = getReportWindow('daily', new Date()).start
    const yesterdayMidTs = new Date(new Date(todayStart).getTime() - 12 * 3600 * 1000).toISOString()
    db.prepare("INSERT INTO wechat_messages (user_id, role, content, created_at) VALUES ('u1','user','今天聊了项目A',?)")
      .run(yesterdayMidTs)

    const { upsertChunks } = await import('../services/vector/vector.service.js')
    upsertChunks.mockClear() // 共享 mock，先清掉 addMemory 用例的历史调用
    const first = await consolidateDayMemory('u1')
    expect(first.saved).toBe(2) // mock agent 在 loop 内调 add_memory 写了 2 条
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_memories').get()).toMatchObject({ c: 2 })
    expect(upsertChunks).toHaveBeenCalledTimes(2)
    expect(upsertChunks).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({
        id: expect.stringMatching(/^mem\d+$/),
        metadata: expect.objectContaining({ memory_id: expect.any(Number), user_id: 'u1', memory_date: expect.any(String) })
      })]),
      'oneplace_memory'
    )

    const second = await consolidateDayMemory('u1')
    expect(second.saved).toBe(0)
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_memories').get()).toMatchObject({ c: 2 })
  })

  it('当天无记录时跳过，不调用 LLM', async () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM wechat_messages').run()
    // 此刻在今天北京 00:00（整理窗口 end）之后 → 落在「昨天」窗口外，不触发整理
    db.prepare("INSERT INTO wechat_messages (user_id, role, content, created_at) VALUES ('u1','user','今天的事',?)")
      .run(new Date().toISOString())

    const { runAgentTurn } = await import('../services/wechat/ilink-bot.service.js')
    runAgentTurn.mockClear() // 清掉上个用例的调用记录，仅验证本次没有调用 LLM
    const res = await consolidateDayMemory('u1')
    expect(res.saved).toBe(0)
    expect(runAgentTurn).not.toHaveBeenCalled()
  })
})

describe('searchMemoryVectors', () => {
  it('映射 Qdrant payload', async () => {
    const { searchChunks } = await import('../services/vector/vector.service.js')
    ;(searchChunks as any).mockResolvedValueOnce([
      { id: 'mem1', score: 0.9, payload: { memory_id: 1, content: '用户喝美式', memory_date: '2026-08-01', user_id: 'u1' } }
    ])
    const res = await searchMemoryVectors('美式', { userId: 'u1' })
    expect(res[0]).toMatchObject({ memory_id: 1, content: '用户喝美式', memory_date: '2026-08-01', score: 0.9 })
  })
})
