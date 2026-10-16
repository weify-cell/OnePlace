import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@wechatbot/wechatbot', async () => await import('./helpers/fake-wechat-sdk.js'))
vi.mock('../database/index.js', async () => await import('./helpers/test-db.js'))

import { clearMessageHistory, deliverBotTurn, getMessageHistory } from '../services/wechat/ilink-bot.service.js'

/**
 * 一回合的收尾：发出去、跳过、还是空了。
 *
 * 发送器是注入的（位置推送的 `runTurn` 同款做法），所以这里验的是**账目**
 * ——会不会发、历史里留下什么——而不是模型的输出。
 */

const USER = 'user-1'

beforeEach(() => {
  clearMessageHistory()
})

describe('跳过：你说的话留下，它什么都不说', () => {
  it('不发送、不留 assistant 行，但你的消息要入库', async () => {
    const sent: string[] = []

    const outcome = await deliverBotTurn({
      userId: USER,
      userText: '（转发了一条链接）',
      replyContent: 'SKIP',
      send: async (text) => { sent.push(text) }
    })

    expect(outcome).toBe('skipped')
    expect(sent).toHaveLength(0)
    const history = getMessageHistory(USER)
    expect(history.map(m => m.role)).toEqual(['user'])
    expect(history[0].content).toContain('转发了一条链接')
  })

  it('跳过要记日志（否则"它怎么不回我"只能靠猜，也没法据日志调提示词张紧度）', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await deliverBotTurn({
      userId: USER, userText: '（转发）', replyContent: 'SKIP', send: async () => {}
    })

    expect(log.mock.calls.flat().join(' ')).toContain('[ilink]')
    expect(log.mock.calls.flat().join(' ')).toContain('跳过')
    log.mockRestore()
  })

  it('标记容忍一个句号，照样算跳过', async () => {
    const sent: string[] = []
    const outcome = await deliverBotTurn({
      userId: USER, userText: '嗯', replyContent: 'skip。', send: async (t) => { sent.push(t) }
    })

    expect(outcome).toBe('skipped')
    expect(sent).toHaveLength(0)
  })
})

describe('空文本：是生成异常，不是跳过', () => {
  it('同样不发送，但原因分开记（要能查出来机器人为什么变哑了）', async () => {
    const sent: string[] = []
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const outcome = await deliverBotTurn({
      userId: USER, userText: '在吗', replyContent: '', send: async (t) => { sent.push(t) }
    })

    expect(outcome).toBe('empty')
    expect(sent).toHaveLength(0)
    expect(warn).toHaveBeenCalled()
    expect(warn.mock.calls.flat().join(' ')).toContain('[ilink]')
    warn.mockRestore()
  })

  it('纯空白也算空（不把一段空白发到微信里）', async () => {
    const sent: string[] = []
    const outcome = await deliverBotTurn({
      userId: USER, userText: '在吗', replyContent: '   \n  ', send: async (t) => { sent.push(t) }
    })

    expect(outcome).toBe('empty')
    expect(sent).toHaveLength(0)
  })
})

describe('正常回复', () => {
  it('发出去，历史里留下你的一句和它的一句', async () => {
    const sent: string[] = []

    const outcome = await deliverBotTurn({
      userId: USER, userText: '今天几号', replyContent: '10 月 16 号。', send: async (t) => { sent.push(t) }
    })

    expect(outcome).toBe('sent')
    expect(sent).toEqual(['10 月 16 号。'])
    expect(getMessageHistory(USER).map(m => m.role)).toEqual(['user', 'assistant'])
  })

  it('不像跳过标记的正常文本照发（不误判）', async () => {
    const sent: string[] = []
    await deliverBotTurn({
      userId: USER, userText: '?', replyContent: '好吧，先不打扰你了。', send: async (t) => { sent.push(t) }
    })

    expect(sent).toHaveLength(1)
  })

  it('发送抛错 → 不写 assistant 行（没送出去就别让它以为自己说过），但你的消息已入库', async () => {
    await expect(deliverBotTurn({
      userId: USER, userText: 'hi', replyContent: 'hi',
      send: async () => { throw new Error('微信侧炸了') }
    })).rejects.toThrow('微信侧炸了')

    expect(getMessageHistory(USER).map(m => m.role)).toEqual(['user'])
  })
})

describe('同一回合的先后顺序', () => {
  it('你的消息在 assistant 行之前（顺序颠倒会让历史读起来像它先说你后答）', async () => {
    await deliverBotTurn({
      userId: USER, userText: '第一个问题', replyContent: '第一个回答', send: async () => {}
    })

    const history = getMessageHistory(USER)
    expect(history[0].content).toContain('第一个问题')
    expect(history[1].content).toContain('第一个回答')
  })

  it('连续跳过会留下连续的用户消息（不能因此抛错）', async () => {
    await deliverBotTurn({ userId: USER, userText: '一', replyContent: 'SKIP', send: async () => {} })
    await deliverBotTurn({ userId: USER, userText: '二', replyContent: 'SKIP', send: async () => {} })

    expect(getMessageHistory(USER).map(m => m.role)).toEqual(['user', 'user'])
  })
})
