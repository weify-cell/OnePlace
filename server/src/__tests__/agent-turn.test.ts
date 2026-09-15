import { describe, expect, it, vi } from 'vitest'
import {
  AGENT_SCOPE_WEB,
  AGENT_SCOPE_WECHAT,
  belongsToScope,
  extractAssistantText,
  webAgentId,
  wechatAgentId,
  wechatTaskAgentId
} from '../services/ai/agent-turn.js'
import { AgentPool } from '../services/ai/agent-pool.js'

describe('agent id 层前缀', () => {
  it('各层 id 带可判定的前缀', () => {
    expect(webAgentId(7)).toBe('web:conv:7')
    expect(wechatAgentId('wxid_alice')).toBe('wx:wxid_alice')
    expect(wechatTaskAgentId('report', 'daily:u1')).toBe('wx:report:daily:u1')
    expect(wechatTaskAgentId('memory', 'consolidate:u1')).toBe('wx:memory:consolidate:u1')
  })
})

describe('belongsToScope', () => {
  it('微信层 id 不属于 Web 层，反之亦然（回归：停止 bot 曾连带清空 Web 对话池）', () => {
    const wechatIds = [wechatAgentId('u1'), wechatTaskAgentId('report', 'daily:u1'), wechatTaskAgentId('proactive', 'u1')]
    const webIds = [webAgentId(1), webAgentId(42)]

    for (const id of wechatIds) {
      expect(belongsToScope(id, AGENT_SCOPE_WECHAT)).toBe(true)
      expect(belongsToScope(id, AGENT_SCOPE_WEB)).toBe(false)
    }
    for (const id of webIds) {
      expect(belongsToScope(id, AGENT_SCOPE_WEB)).toBe(true)
      expect(belongsToScope(id, AGENT_SCOPE_WECHAT)).toBe(false)
    }
  })
})

describe('AgentPool.ids / remove（按层销毁的支撑）', () => {
  function makePool(): AgentPool {
    return new AgentPool(
      (() => {}) as never,
      [],
      { id: 'm', name: 'm', api: 'openai-completions', provider: 'qwen', baseUrl: '', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000, maxTokens: 100 } as never,
      () => 'key',
      ''
    )
  }

  it('ids 暴露全部键，可据此只移除某一层', () => {
    const pool = makePool()
    pool.getOrCreate(webAgentId(1), () => [])
    pool.getOrCreate(wechatAgentId('u1'), () => [])
    pool.getOrCreate(wechatTaskAgentId('memory', 'consolidate:u1'), () => [])

    expect(pool.ids()).toHaveLength(3)

    for (const id of pool.ids()) {
      if (belongsToScope(id, AGENT_SCOPE_WECHAT)) pool.remove(id)
    }

    expect(pool.ids()).toEqual(['web:conv:1'])
  })
})

describe('extractAssistantText', () => {
  it('取最后一条 assistant 的文本内容', () => {
    const messages = [
      { role: 'user', content: '问' },
      { role: 'assistant', content: [{ type: 'text', text: '旧回复' }] },
      { role: 'user', content: '再问' },
      { role: 'assistant', content: [{ type: 'text', text: '新' }, { type: 'text', text: '回复' }] }
    ] as never
    expect(extractAssistantText(messages)).toBe('新回复')
  })

  it('没有 assistant 文本时返回空串', () => {
    expect(extractAssistantText([{ role: 'user', content: '问' }] as never)).toBe('')
    expect(extractAssistantText([])).toBe('')
  })
})
