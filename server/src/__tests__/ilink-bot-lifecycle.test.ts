import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 生命周期 seam：只管 startILinkBot / stopILinkBot / session:expired 的可观察行为。
 * 同样只 mock 系统边界：外部 SDK（共用替身）+ 数据库连接（真库、真迁移）。
 */

vi.mock('@wechatbot/wechatbot', async () => await import('./helpers/fake-wechat-sdk.js'))

vi.mock('../database/index.js', async () => {
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(':memory:')
  return { connectDatabase: () => db }
})

import { connectDatabase } from '../database/index.js'
import { runMigrations } from '../database/migrate.js'
import { lastInstance, resetInstances } from './helpers/fake-wechat-sdk.js'
import { setSetting } from '../services/settings.service.js'
import { getILinkBotStatus, startILinkBot, stopILinkBot } from '../services/wechat/ilink-bot.service.js'
/** 设置当前的启用意图（走应用自己的设置接口） */
function setEnabled(enabled: boolean): void {
  setSetting('ilink_enabled', enabled)
}

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
  const db = connectDatabase()
  runMigrations(db)
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `)
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
})
