import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 主动聊天这一轮「要发出去的内容」这个 seam。
 *
 * 只 mock 系统边界：外部 SDK（共用替身）+ 数据库连接（真库、真迁移）。
 * 不 mock 自家模块——这里要验的正是「历史有没有被带进这一轮」。
 */
vi.mock('@wechatbot/wechatbot', async () => await import('./helpers/fake-wechat-sdk.js'))
vi.mock('../database/index.js', async () => await import('./helpers/test-db.js'))

import { connectDatabase } from '../database/index.js'
import { addMessageToHistory } from '../services/wechat/ilink-bot.service.js'
import {
  buildProactiveTurn,
  decideProactiveSend,
  proactiveBackoffFactor,
  proactiveSendProbability,
  resolveUnrepliedCount
} from '../services/wechat/proactive-chat.service.js'

const USER = 'o9cq80-test-user'
const OTHER = 'other-user'

beforeEach(() => {
  const db = connectDatabase()
  db.prepare('DELETE FROM wechat_messages').run()
  db.prepare('DELETE FROM settings').run()
})

describe('主动聊天这一轮要发出去的内容', () => {
  it('把该用户的聊天历史带进这一轮（不再只靠 search_memory 捞）', async () => {
    addMessageToHistory(USER, 'user', '我最近在读《习惯的力量》')
    addMessageToHistory(USER, 'assistant', '读到第几章了？')

    const req = await buildProactiveTurn(USER)

    expect(req.history?.()).toEqual([
      { role: 'user', content: '我最近在读《习惯的力量》' },
      { role: 'assistant', content: '读到第几章了？' }
    ])
  })

  it('只带这个用户自己的历史', async () => {
    addMessageToHistory(USER, 'user', '我的消息')
    addMessageToHistory(OTHER, 'user', '别人的消息')

    const req = await buildProactiveTurn(USER)

    expect(req.history?.().map(m => m.content)).toEqual(['我的消息'])
  })

  it('没有任何历史时也照样能出一轮（不抛错）', async () => {
    const req = await buildProactiveTurn(USER)

    expect(req.history?.()).toEqual([])
    expect(req.userContent).toContain('北京时间')
  })

  it('独立 agent id + 回合后销毁：不污染 bot 的对话上下文', async () => {
    const req = await buildProactiveTurn(USER)

    expect(req.agentId).toBe(`wx:proactive:${USER}`)
    expect(req.ephemeral).toBe(true)
    expect(req.memoryUserId).toBe(USER)
  })

  it('历史是按时间正序的（最新的一条在最后）', async () => {
    addMessageToHistory(USER, 'user', '第一句')
    addMessageToHistory(USER, 'assistant', '第二句')
    addMessageToHistory(USER, 'user', '第三句')

    const req = await buildProactiveTurn(USER)

    expect(req.history?.().map(m => m.content)).toEqual(['第一句', '第二句', '第三句'])
  })
})

describe('触发概率（按距「最后一条消息」多久）', () => {
  it('不足一小时（45 分钟下限之后那一段）给最低概率', () => {
    expect(proactiveSendProbability(45)).toBe(0.1)
    expect(proactiveSendProbability(59.9)).toBe(0.1)
  })

  it('越久概率越高', () => {
    expect(proactiveSendProbability(60)).toBe(0.3)
    expect(proactiveSendProbability(120)).toBe(0.5)
    expect(proactiveSendProbability(240)).toBe(0.7)
    expect(proactiveSendProbability(480)).toBe(0.9)
  })

  it('未回复退避：连续未回 n 次 → 概率乘 3⁻ⁿ', () => {
    expect(proactiveBackoffFactor(0)).toBe(1)
    expect(proactiveBackoffFactor(1)).toBeCloseTo(1 / 3)
    expect(proactiveBackoffFactor(2)).toBeCloseTo(1 / 9)
    expect(proactiveBackoffFactor(3)).toBeCloseTo(1 / 27)
  })
})

describe('是否发送的判定（纯函数，便于解释「为什么这次没发」）', () => {
  const base = {
    nowMs: 1_000_000_000,
    lastMessageAtMs: 1_000_000_000 - 50 * 60 * 1000, // 距最后一条消息 50 分钟
    unrepliedCount: 0,
    minIntervalMinutes: 45,
    roll: 0.05
  }

  it('还没有任何消息时不发（无从判断你的状态）', () => {
    expect(decideProactiveSend({ ...base, lastMessageAtMs: null }))
      .toMatchObject({ send: false, reason: 'no-message-yet' })
  })

  it('距最后一条消息不足最小间隔 → 不发（刚聊完不插话）', () => {
    expect(decideProactiveSend({ ...base, lastMessageAtMs: base.nowMs - 44 * 60 * 1000 }))
      .toMatchObject({ send: false, reason: 'min-interval' })
  })

  it('过了最小间隔且掷中 → 发', () => {
    expect(decideProactiveSend(base)).toMatchObject({ send: true, reason: 'ok', probability: 0.1 })
  })

  it('掷不中 → 不发', () => {
    expect(decideProactiveSend({ ...base, roll: 0.5 }))
      .toMatchObject({ send: false, reason: 'not-lucky' })
  })

  it('退避后同样的骰子点数就发不出去了', () => {
    // 同样距 50 分钟、同样掷 0.05，但连续未回 1 次 → 概率降到 0.1/3
    const d = decideProactiveSend({ ...base, unrepliedCount: 1 })
    expect(d).toMatchObject({ send: false, reason: 'not-lucky' })
    expect(d.probability).toBeCloseTo(0.1 / 3)
  })

  it('退避不设截止：连续未回 6 次仍给一个很小的概率', () => {
    const d = decideProactiveSend({ ...base, unrepliedCount: 6 })
    expect(d.probability).toBeGreaterThan(0)
    expect(d.probability).toBeLessThan(0.001)
  })
})

describe('连续未回复次数', () => {
  const sent = 1_000_000_000

  it('从未主动搭话过 → 0', () => {
    expect(resolveUnrepliedCount({ lastUserMessageAtMs: sent - 1000, lastProactiveSentAtMs: null, storedCount: 3 })).toBe(0)
  })

  it('上次搭话之后用户说过话 → 归零（退避解除）', () => {
    expect(resolveUnrepliedCount({ lastUserMessageAtMs: sent + 1000, lastProactiveSentAtMs: sent, storedCount: 3 })).toBe(0)
  })

  it('上次搭话之后用户没说话 → 沿用累计次数', () => {
    expect(resolveUnrepliedCount({ lastUserMessageAtMs: sent - 1000, lastProactiveSentAtMs: sent, storedCount: 2 })).toBe(2)
  })
})
