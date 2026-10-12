import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 数据库换掉的是「连接」这个系统边界：内存真库 + 真迁移
vi.mock('../database/index.js', async () => {
  const { connectDatabase } = await import('./helpers/test-db.js')
  return { connectDatabase }
})

// 只 mock 外部系统：embedding 服务与向量库。
// 整理要跑的 LLM 回合是系统边界，用**注入的替身**换掉（测试里不 mock 自家模块）。
vi.mock('../services/ai/embedding-client.js', () => ({
  embedText: vi.fn(async () => [0.1, 0.2, 0.3])
}))
vi.mock('../services/vector/vector.service.js', () => ({
  upsertChunks: vi.fn(async () => ({ success: true, count: 1 })),
  searchChunks: vi.fn(async () => [])
}))

import { connectDatabase } from '../database/index.js'
import {
  addMemory,
  consolidatePendingMemories,
  pendingConsolidationDates,
  type MemoryTurnRunner
} from '../services/wechat/memory.service.js'
import { getMemoryConsolidatedDate, saveWeChatUser, setMemoryConsolidatedDate } from '../services/wechat/users.service.js'

const USER = 'o9cq80-MdnFCKz30YcmUxnq8ok1o@im.wechat'

function rows(): Array<{ user_id: string; content: string; memory_date: string }> {
  return connectDatabase()
    .prepare('SELECT user_id, content, memory_date FROM wechat_memories ORDER BY id')
    .all() as Array<{ user_id: string; content: string; memory_date: string }>
}

/** 插入一条聊天记录（created_at 用 UTC ISO） */
function insertMessage(content: string, at: string): void {
  connectDatabase()
    .prepare("INSERT INTO wechat_messages (user_id, role, content, created_at) VALUES (?, 'user', ?, ?)")
    .run(USER, content, at)
}

/** 整理时用的 LLM 替身：记录每次被要求整理的转写文本 */
function fakeTurn(captured: string[]): MemoryTurnRunner {
  return async (req) => {
    captured.push(req.userContent)
    return ''
  }
}

beforeEach(() => {
  const db = connectDatabase()
  db.prepare('DELETE FROM wechat_memories').run()
  db.prepare('DELETE FROM wechat_messages').run()
  db.prepare('DELETE FROM settings').run()
  saveWeChatUser(USER)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('写入校验与归一化（对话写入与每晚整理共用的唯一入口）', () => {
  it('空白内容与单字内容被拒，不落库', async () => {
    expect((await addMemory(USER, '   ', '2026-10-12')).status).toBe('invalid')
    expect((await addMemory(USER, '好', '2026-10-12')).status).toBe('invalid')
    expect(rows()).toEqual([])
  })

  it('内容两端空白被去掉后落库', async () => {
    const res = await addMemory(USER, '  用户喜欢美式  ', '2026-10-12')
    expect(res.status).toBe('new')
    expect(rows()).toEqual([{ user_id: USER, content: '用户喜欢美式', memory_date: '2026-10-12' }])
  })

  it('正文里的用户 ID 痕迹被去掉：括号缩写形式与完整形式都不落库', async () => {
    await addMemory(USER, '用户（o9cq80...）喜欢美式咖啡', '2026-10-12')
    await addMemory(USER, `用户 ${USER} 最近在读《非暴力沟通》`, '2026-10-12')
    await addMemory(USER, '用户(o9cq80...)睡前跑五公里', '2026-10-12')

    // 正文里的实际形态是「（o9cq80...）」这种括号缩写（全库 184/210 条），完整 ID 形态是防御性的：
    // 删掉 ID 后两端空格合并成一个，不影响可读性。
    expect(rows().map(r => r.content)).toEqual([
      '用户喜欢美式咖啡',
      '用户 最近在读《非暴力沟通》',
      '用户睡前跑五公里'
    ])
  })

  it('去掉 ID 痕迹后只剩空内容，视为无效而不落库', async () => {
    expect((await addMemory(USER, '（o9cq80...）', '2026-10-12')).status).toBe('invalid')
    expect(rows()).toEqual([])
  })
})

describe('pendingConsolidationDates —— 该补哪几天', () => {
  const NOW = new Date('2026-10-12T04:30:00.000Z') // 北京 10-12 12:30

  it('从未整理过时只补昨天，不回溯全部历史', () => {
    expect(pendingConsolidationDates(null, NOW)).toEqual(['2026-10-11'])
  })

  it('补齐「上次成功的次日」到昨天，逐日一天', () => {
    expect(pendingConsolidationDates('2026-10-08', NOW)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11'])
  })

  it('昨天已整理过时不重复', () => {
    expect(pendingConsolidationDates('2026-10-11', NOW)).toEqual([])
  })

  it('记录落在未来（时钟回拨）时不倒着补', () => {
    expect(pendingConsolidationDates('2026-10-13', NOW)).toEqual([])
  })

  it('跨月边界正常推进', () => {
    const now = new Date('2026-11-02T04:30:00.000Z') // 北京 11-02
    expect(pendingConsolidationDates('2026-10-30', now)).toEqual(['2026-10-31', '2026-11-01'])
  })
})

describe('整理补跑', () => {
  const NOW = new Date('2026-10-12T04:30:00.000Z') // 北京 10-12 12:30

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  it('错过窗口的那天，在下次运行时被补上', async () => {
    // 10-09 / 10-10 / 10-11 各有对话，但整理从 10-08 之后就再没成功过
    insertMessage('10-09 聊项目A', '2026-10-09T04:00:00.000Z') // 北京 10-09 12:00
    insertMessage('10-10 聊阅读', '2026-10-10T04:00:00.000Z')
    insertMessage('10-11 聊冥想', '2026-10-11T04:00:00.000Z')
    setMemoryConsolidatedDate(USER, '2026-10-08')

    const captured: string[] = []
    const res = await consolidatePendingMemories(USER, fakeTurn(captured))

    expect(res.days).toBe(3)
    expect(getMemoryConsolidatedDate(USER)).toBe('2026-10-11')
    // 每天各自一回整理，且只看到那一天自己的对话
    expect(captured).toHaveLength(3)
    expect(captured.filter(t => t.includes('聊项目A'))).toHaveLength(1)
    expect(captured.filter(t => t.includes('聊阅读'))).toHaveLength(1)
    expect(captured.filter(t => t.includes('聊冥想'))).toHaveLength(1)
  })

  it('补完之后再运行不再重做', async () => {
    insertMessage('10-11 聊冥想', '2026-10-11T04:00:00.000Z')
    setMemoryConsolidatedDate(USER, '2026-10-10')

    const captured: string[] = []
    await consolidatePendingMemories(USER, fakeTurn(captured))
    expect(captured).toHaveLength(1)

    const again = await consolidatePendingMemories(USER, fakeTurn(captured))
    expect(again.days).toBe(0)
    expect(captured).toHaveLength(1)
  })

  it('整天没有对话时不调 LLM，但仍记为已整理（否则每天都会重试）', async () => {
    setMemoryConsolidatedDate(USER, '2026-10-10')

    const captured: string[] = []
    const res = await consolidatePendingMemories(USER, fakeTurn(captured))

    expect(res.days).toBe(1)
    expect(captured).toEqual([])
    expect(getMemoryConsolidatedDate(USER)).toBe('2026-10-11')
  })

  it('整理失败的那天不记账，下次运行仍会重试', async () => {
    insertMessage('10-11 聊冥想', '2026-10-11T04:00:00.000Z')
    setMemoryConsolidatedDate(USER, '2026-10-10')

    const failingTurn = async () => { throw new Error('LLM 挂了') }
    await expect(consolidatePendingMemories(USER, failingTurn)).rejects.toThrow('LLM 挂了')
    expect(getMemoryConsolidatedDate(USER)).toBe('2026-10-10')

    const captured: string[] = []
    const res = await consolidatePendingMemories(USER, fakeTurn(captured))
    expect(res.days).toBe(1)
    expect(getMemoryConsolidatedDate(USER)).toBe('2026-10-11')
  })
})
