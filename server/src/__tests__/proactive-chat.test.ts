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
import { buildProactiveTurn, proactiveTriggerWeight } from '../services/wechat/proactive-chat.service.js'

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

describe('触发概率（距上次互动多久）', () => {
  it('刚互动过也不完全不动（死区 0.1，不是 0）', () => {
    expect(proactiveTriggerWeight(0)).toBe(0.1)
    expect(proactiveTriggerWeight(0.5)).toBe(0.1)
    expect(proactiveTriggerWeight(0.99)).toBe(0.1)
  })

  it('超过一小时逐渐升高', () => {
    expect(proactiveTriggerWeight(1)).toBe(0.3)
    expect(proactiveTriggerWeight(3)).toBe(0.5)
    expect(proactiveTriggerWeight(6)).toBe(0.7)
    expect(proactiveTriggerWeight(10)).toBe(0.9)
  })

  it('从未互动过时给中间值', () => {
    expect(proactiveTriggerWeight(null)).toBe(0.5)
  })
})
