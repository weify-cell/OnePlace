import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 本文件只 mock **系统边界**（外部微信 SDK），不 mock 自家模块：
 * 数据库给的是真库——内存 SQLite + 真迁移，通过公共接口 getILinkBotStatus() 观察行为。
 */

// SDK 是系统边界，替身在 helpers 里共用（工厂用动态导入，避开 vi.mock 的变量提升限制）
vi.mock('@wechatbot/wechatbot', async () => await import('./helpers/fake-wechat-sdk.js'))

// 数据库是系统边界：换掉的是「连接」，给的是真库（内存 SQLite + 真迁移）
vi.mock('../database/index.js', async () => await import('./helpers/test-db.js'))

import { connectDatabase, restoreSchema } from './helpers/test-db.js'
import { setEnabled } from './helpers/intent.js'
import { resetInstances } from './helpers/fake-wechat-sdk.js'
import { getILinkBotStatus, stopILinkBot } from '../services/wechat/ilink-bot.service.js'
import { autoStartWeChatBot } from '../services/wechat/bootstrap.js'

/** 跑完 autoStartWeChatBot 的全部内部延迟 */
async function runAutoStart(): Promise<void> {
  const pending = autoStartWeChatBot()
  await vi.advanceTimersByTimeAsync(60_000)
  await pending
}

beforeEach(() => {
  vi.useFakeTimers()
  // 冻结在一个「没有任何后台作业到期」的时刻：北京 10:00
  vi.setSystemTime(new Date('2026-09-15T02:00:00.000Z'))
  // 若上一个用例破坏过 schema，让真迁移把它重建回来（不手写 DDL）
  restoreSchema()
  resetInstances()
})

afterEach(() => {
  // 运行态是模块级单例，用例之间必须复位（用公共接口复位，不碰内部状态）
  if (getILinkBotStatus().running) stopILinkBot()
  vi.useRealTimers()
})

describe('autoStartWeChatBot', () => {
  it('启用意图为关闭时不进入运行态', async () => {
    setEnabled(false)

    await runAutoStart()

    expect(getILinkBotStatus().running).toBe(false)
  })

  it('启用意图为真时进入运行态', async () => {
    setEnabled(true)

    await runAutoStart()

    expect(getILinkBotStatus().running).toBe(true)
  })

  it('依赖不可用（读设置就失败）时不向调用方外抛', async () => {
    setEnabled(true)
    // 真实的失败注入：库坏了，读设置直接报错——比 mock 自家模块更贴近事故
    connectDatabase().exec('DROP TABLE settings')

    await expect(runAutoStart()).resolves.toBeUndefined()
  })

  it('不抢服务启动那一瞬间：延迟结束前不进入运行态', async () => {
    setEnabled(true)

    const pending = autoStartWeChatBot()
    await vi.advanceTimersByTimeAsync(500)
    expect(getILinkBotStatus().running).toBe(false)

    await vi.advanceTimersByTimeAsync(60_000)
    await pending
    expect(getILinkBotStatus().running).toBe(true)
  })

  // 防线测试（不是红→绿驱动出来的）：它靠变异验证过——一旦有人把 NODE_ENV 判断加回来，它会立刻变红。
  // 理由见 docs/adr/0001：本项目的日常运行方式就是开发模式，判环境等于让这个功能永不生效。
  it('不看 NODE_ENV：开发模式下照样自动拉起', async () => {
    const original = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    try {
      setEnabled(true)

      await runAutoStart()

      expect(getILinkBotStatus().running).toBe(true)
    } finally {
      process.env.NODE_ENV = original
    }
  })
})
