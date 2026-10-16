import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@wechatbot/wechatbot', async () => await import('./helpers/fake-wechat-sdk.js'))
vi.mock('../database/index.js', async () => await import('./helpers/test-db.js'))

import { clearMessageHistory, getMessageHistory } from '../services/wechat/ilink-bot.service.js'
import { proactiveSkipCooldownGate, runProactiveTurn, skipCooldownActive } from '../services/wechat/proactive-chat.service.js'
import { addMessageToHistory } from '../services/wechat/ilink-bot.service.js'
import { saveWeChatUser } from '../services/wechat/users.service.js'
import { setSetting } from '../services/settings.service.js'
import { getLastSentAt } from '../services/wechat/delivery.js'

/**
 * 主动搭话的三种结局与冷却。
 *
 * 生成器与发送器都是注入的（位置推送的 `runTurn` 同款做法）——这里验的是**账目**，
 * 不是模型说什么。跳过与空文本的后果一样（都不发），但账目必须分开：
 * 跳过要记冷却、不算未回复；空文本只是异常。
 */

const USER = 'user-1'
const NOW = Date.parse('2026-10-16T12:00:00.000Z')

beforeEach(() => {
  clearMessageHistory()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('冷却的判定（纯函数：是不是刚跳过、还没等到你说话）', () => {
  it('从没跳过 → 不在冷却里', () => {
    expect(skipCooldownActive({ nowMs: NOW, lastSkipAtMs: null, lastUserMessageAtMs: NOW, cooldownMinutes: 30 })).toBe(false)
  })

  it('刚跳过 10 分钟、你之后没说话 → 还在冷却里（别再问它）', () => {
    expect(skipCooldownActive({
      nowMs: NOW, lastSkipAtMs: NOW - 10 * 60_000, lastUserMessageAtMs: NOW - 60 * 60_000, cooldownMinutes: 30
    })).toBe(true)
  })

  it('过了 30 分钟 → 解除', () => {
    expect(skipCooldownActive({
      nowMs: NOW, lastSkipAtMs: NOW - 31 * 60_000, lastUserMessageAtMs: NOW - 60 * 60_000, cooldownMinutes: 30
    })).toBe(false)
  })

  it('跳过之后你说了话 → 立刻解除（前提变了，重新判断）', () => {
    expect(skipCooldownActive({
      nowMs: NOW, lastSkipAtMs: NOW - 5 * 60_000, lastUserMessageAtMs: NOW - 60_000, cooldownMinutes: 30
    })).toBe(false)
  })

  it('你说话发生在跳过之前 → 不算解除', () => {
    expect(skipCooldownActive({
      nowMs: NOW, lastSkipAtMs: NOW - 5 * 60_000, lastUserMessageAtMs: NOW - 10 * 60_000, cooldownMinutes: 30
    })).toBe(true)
  })

  it('冷却设为 0 → 等于不冷却', () => {
    expect(skipCooldownActive({
      nowMs: NOW, lastSkipAtMs: NOW - 60_000, lastUserMessageAtMs: null, cooldownMinutes: 0
    })).toBe(false)
  })
})

describe('跳过：不发、不记历史、不推进退避', () => {
  it('模型说跳过 → 什么都不发，历史干净', async () => {
    const sent: string[] = []

    const outcome = await runProactiveTurn({
      userId: USER,
      decidedForLastMessageAtMs: NOW - 60 * 60_000,
      generate: async () => 'SKIP',
      send: async (t) => { sent.push(t); return true }
    })

    expect(outcome).toBe('skipped')
    expect(sent).toHaveLength(0)
    // 触发指令也不记：没发出去就不该留痕，否则它下次以为自己搭过话
    expect(getMessageHistory(USER)).toHaveLength(0)
  })

  it('跳过不算送达（调用方据此不推进未回复计数）', async () => {
    const outcome = await runProactiveTurn({
      userId: USER, decidedForLastMessageAtMs: null, generate: async () => ' skip。', send: async () => true
    })

    expect(outcome).not.toBe('sent')
  })
})

describe('发送异常', () => {
  it('发送抛错 → failed，且不冲垮调用方的循环（本轮其它用户还要继续）', async () => {
    const outcome = await runProactiveTurn({
      userId: USER,
      decidedForLastMessageAtMs: null,
      generate: async () => '嗨',
      send: async () => { throw new Error('微信侧炸了') }
    })

    expect(outcome).toBe('failed')
    expect(getMessageHistory(USER)).toHaveLength(0)
  })
})

describe('空文本：生成异常，与跳过分开记账', () => {
  it('不发、记 warning', async () => {
    const sent: string[] = []

    const outcome = await runProactiveTurn({
      userId: USER,
      decidedForLastMessageAtMs: null,
      generate: async () => '',
      send: async (t) => { sent.push(t); return true }
    })

    expect(outcome).toBe('empty')
    expect(sent).toHaveLength(0)
    expect(console.warn).toHaveBeenCalled()
  })

  it('生成抛错 → 归类为 failed，不发也不打扰（下一轮还会试）', async () => {
    const sent: string[] = []

    const outcome = await runProactiveTurn({
      userId: USER,
      decidedForLastMessageAtMs: null,
      generate: async () => { throw new Error('模型挂了') },
      send: async (t) => { sent.push(t); return true }
    })

    expect(outcome).toBe('failed')
    expect(sent).toHaveLength(0)
    expect(getMessageHistory(USER)).toHaveLength(0)
  })
})

describe('正常搭话', () => {
  it('发出去，历史留下"触发指令 + 它的话"两条（交替格式）', async () => {
    const sent: string[] = []

    const outcome = await runProactiveTurn({
      userId: USER,
      decidedForLastMessageAtMs: NOW - 60 * 60_000,
      generate: async () => '在忙什么呢？',
      send: async (t) => { sent.push(t); return true }
    })

    expect(outcome).toBe('sent')
    expect(sent).toEqual(['在忙什么呢？'])
    expect(getMessageHistory(USER).map(m => m.role)).toEqual(['user', 'assistant'])
  })

  it('发送成功会记下送达时间（最小间隔的钟从这里走）', async () => {
    await runProactiveTurn({
      userId: USER, decidedForLastMessageAtMs: null, generate: async () => '嗨', send: async () => true
    })

    expect(getLastSentAt('proactive', USER)).not.toBeNull()
  })

  it('生成期间你说话了 → 作废，不发也不留痕', async () => {
    const sent: string[] = []

    const outcome = await runProactiveTurn({
      userId: USER,
      // 判定时看到的最后一条消息，比"现在的"更旧 → 你在生成期间说话了
      decidedForLastMessageAtMs: NOW - 60 * 60_000,
      currentLastMessageAtMs: () => NOW,
      generate: async () => '在忙什么呢？',
      send: async (t) => { sent.push(t); return true }
    })

    expect(outcome).toBe('stale')
    expect(sent).toHaveLength(0)
    expect(getMessageHistory(USER)).toHaveLength(0)
  })

  it('未送达（token 过期入队）→ 不算 sent，不写历史', async () => {
    const outcome = await runProactiveTurn({
      userId: USER,
      decidedForLastMessageAtMs: NOW - 60 * 60_000,
      generate: async () => '嗨',
      send: async () => false
    })

    expect(outcome).toBe('undelivered')
    expect(getMessageHistory(USER)).toHaveLength(0)
  })
})

describe('冷却闸门用的是「你自己说话」，不是「任意一条消息」', () => {
  it('跳过之后机器人自己发过提醒/推送（assistant 行）→ 冷却不解除', () => {
    setSetting('ilink_proactive_skip_at_user-1', Date.now() - 5 * 60_000)
    addMessageToHistory('user-1', 'assistant', '⏰ 待办任务提醒…')

    expect(proactiveSkipCooldownGate('user-1', Date.now())).toBe(true)
  })

  it('你自己说了话 → 冷却解除', () => {
    setSetting('ilink_proactive_skip_at_user-1', Date.now() - 5 * 60_000)
    saveWeChatUser('user-1', 'wxid-1') // 收消息时会把"最后一次活跃"刷新到此刻

    expect(proactiveSkipCooldownGate('user-1', Date.now())).toBe(false)
  })
})

describe('判定顺序：过时先于分流', () => {
  it('生成期间你说话了，即使这轮产出是空的 → 记为 stale（同类判定只排一次序）', async () => {
    const outcome = await runProactiveTurn({
      userId: USER,
      decidedForLastMessageAtMs: NOW - 60 * 60_000,
      currentLastMessageAtMs: () => NOW,
      generate: async () => '',
      send: async () => true
    })

    expect(outcome).toBe('stale')
  })
})
