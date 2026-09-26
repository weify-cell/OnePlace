import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 生命周期 seam：只管 startILinkBot / stopILinkBot / session:expired 的可观察行为。
 * 同样只 mock 系统边界：外部 SDK（共用替身）+ 数据库连接（真库、真迁移）。
 */

vi.mock('@wechatbot/wechatbot', async () => await import('./helpers/fake-wechat-sdk.js'))

// 数据库是系统边界：换掉的是「连接」，给的是真库（内存 SQLite + 真迁移）
vi.mock('../database/index.js', async () => await import('./helpers/test-db.js'))

import { lastInstance, resetInstances } from './helpers/fake-wechat-sdk.js'
import { restoreSchema } from './helpers/test-db.js'
import { setEnabled } from './helpers/intent.js'
import { getILinkBotStatus, startILinkBot, stopILinkBot } from '../services/wechat/ilink-bot.service.js'

/** 启动并跑完内部的异步登录与延迟 */
async function startAndSettle(): Promise<{ success: boolean; error?: string }> {
  const pending = startILinkBot()
  await vi.advanceTimersByTimeAsync(60_000)
  return pending
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
  // 运行态是模块级单例，用例之间必须复位（用公共接口复位）
  if (getILinkBotStatus().running) stopILinkBot()
  vi.useRealTimers()
})

describe('startILinkBot', () => {
  it('启用意图为关闭时，手动启动依然可用（意图不是功能总开关）', async () => {
    setEnabled(false)

    const result = await startAndSettle()

    expect(result.success).toBe(true)
    expect(getILinkBotStatus().running).toBe(true)
  })

  it('停止时真的停掉 SDK 轮询（否则旧实例会继续收消息）', async () => {
    setEnabled(true)
    await startAndSettle()
    const bot = lastInstance()!
    expect(bot.isRunning).toBe(true)

    const result = stopILinkBot()

    expect(result.success).toBe(true)
    expect(bot.isRunning).toBe(false)
    expect(getILinkBotStatus().running).toBe(false)
  })

  it('会话过期：运行态结束、状态置为过期、并停掉已死实例的轮询', async () => {
    setEnabled(true)
    await startAndSettle()
    const bot = lastInstance()!

    bot.emit('session:expired')

    const status = getILinkBotStatus()
    expect(status.running).toBe(false)
    expect(status.login.status).toBe('expired')
    expect(bot.isRunning).toBe(false)
  })

  // 防线测试（非红→绿驱动）：靠变异验证——一旦有人拿掉停止时的状态复位，它会立刻变红。
  // 它守的是「停止 → 再启动」这条日常路径：不能复用已经停掉的实例，也不能被当次的运行态挡住。
  it('停止后可以重新启动，且不复用已经停掉的实例', async () => {
    setEnabled(true)
    await startAndSettle()
    const first = lastInstance()!
    stopILinkBot()

    const result = await startAndSettle()

    const second = lastInstance()!
    expect(result.success).toBe(true)
    expect(second).not.toBe(first)
    expect(first.isRunning).toBe(false)
    expect(getILinkBotStatus().running).toBe(true)
  })

  it('旧实例迟到的过期事件，不会打死当前实例', async () => {
    setEnabled(true)
    await startAndSettle()
    const stale = lastInstance()!

    stopILinkBot()
    await startAndSettle()
    const current = lastInstance()!
    expect(current.isRunning).toBe(true)

    // 旧实例的 SDK 内部还会自己强制重登，失败时可能补发一个迟到的 session:expired
    stale.emit('session:expired')

    expect(current.isRunning).toBe(true)
    expect(getILinkBotStatus().running).toBe(true)
    expect(getILinkBotStatus().login.status).toBe('confirmed')
  })

  // 防线测试（非红→绿驱动）：靠变异验证——一旦拿掉 login 上的陈旧判定，它会变红。
  // 场景：旧实例被换掉后，它自己那次强制重登才晚晚地成功，补发一个迟到的 login 事件。
  it('旧实例迟到的登录成功事件，不会把状态说成运行中', async () => {
    setEnabled(true)
    await startAndSettle()
    const stale = lastInstance()!

    stopILinkBot()
    expect(getILinkBotStatus().running).toBe(false)

    stale.emit('login', { accountId: 'acc' })

    expect(getILinkBotStatus().running).toBe(false)
    expect(getILinkBotStatus().login.status).not.toBe('confirmed')
  })
})
