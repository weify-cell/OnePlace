import { describe, expect, it } from 'vitest'

/**
 * 前端 seam：机器人状态 → 显示文案/指示灯的映射。
 * 术语见根 CONTEXT.md（启用意图 / 运行态 / 会话过期）；决策见 docs/adr/0001。
 */

import { resolveBotState } from './botState'

describe('resolveBotState', () => {
  it('意图关闭且没在跑时，说明不会自动拉起', () => {
    const state = resolveBotState({ enabled: false, running: false, loginStatus: 'idle' })

    expect(state.label).toBe('未运行')
    expect(state.dot).toBe('stopped')
    expect(state.hint).toContain('不会自动拉起')
  })

  it('正在运行时显示运行中', () => {
    const state = resolveBotState({ enabled: true, running: true, loginStatus: 'confirmed' })

    expect(state.label).toBe('运行中')
    expect(state.dot).toBe('running')
  })

  it('会话过期时明确提示需要重新扫码', () => {
    const state = resolveBotState({ enabled: true, running: false, loginStatus: 'expired' })

    expect(state.label).toBe('会话已过期')
    expect(state.dot).toBe('error')
    expect(state.hint).toContain('启动 Bot')
  })

  it('开着自动拉起但没在跑时，说明重启后会回来', () => {
    const state = resolveBotState({ enabled: true, running: false, loginStatus: 'idle' })

    expect(state.label).toBe('未运行')
    expect(state.dot).toBe('waiting')
    expect(state.hint).toContain('重启')
  })

  it('意图关闭但正在运行时，运行态不能被掩盖', () => {
    const state = resolveBotState({ enabled: false, running: true, loginStatus: 'confirmed' })

    expect(state.label).toBe('运行中')
    expect(state.dot).toBe('running')
    expect(state.hint).toContain('不会自动拉起')
  })
})
