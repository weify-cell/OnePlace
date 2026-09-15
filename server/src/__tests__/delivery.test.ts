import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../database/index.js', async () => {
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      description TEXT NOT NULL DEFAULT ''
    );
  `)
  return { connectDatabase: () => db }
})

// 不触碰真实的 ~/.wechatbot 私有文件（vi.hoisted 供被提升的 mock 工厂引用）
const { writeFileMock } = vi.hoisted(() => ({ writeFileMock: vi.fn(async () => {}) }))
vi.mock('node:fs/promises', () => ({
  default: { readFile: vi.fn(async () => '{"u1":{}}'), writeFile: writeFileMock },
  readFile: vi.fn(async () => '{"u1":{}}'),
  writeFile: writeFileMock
}))

import { connectDatabase } from '../database/index.js'
import { getSettingValue } from '../services/settings.service.js'
import {
  flushPending,
  getLastSentAt,
  hasPending,
  isDeliveryReady,
  markSentAt,
  sendToUser,
  setDeliveryBot,
  withInflight
} from '../services/wechat/delivery.js'

/** iLink 的 context_token 过期错误形状 */
function expiredTokenError(): Error & { code: string; payload: { ret: number } } {
  const err = new Error('context token expired') as Error & { code: string; payload: { ret: number } }
  err.code = 'API_ERROR'
  err.payload = { ret: -2 }
  return err
}

function makeBot(overrides: { send?: ReturnType<typeof vi.fn> } = {}) {
  return { send: overrides.send ?? vi.fn(async () => {}) } as never
}

beforeEach(() => {
  connectDatabase().prepare('DELETE FROM settings').run()
  setDeliveryBot(null)
  writeFileMock.mockClear()
})

describe('sendToUser', () => {
  it('未注入 bot 时抛错（调用方需先启动子系统）', async () => {
    await expect(sendToUser('u1', 'hi')).rejects.toThrow('delivery bot not set')
    expect(isDeliveryReady()).toBe(false)
  })

  it('成功投递返回 true，不产生积压', async () => {
    const send = vi.fn(async () => {})
    setDeliveryBot(makeBot({ send }))

    await expect(sendToUser('u1', 'hello')).resolves.toBe(true)
    expect(send).toHaveBeenCalledWith('u1', 'hello')
    expect(hasPending('u1')).toBe(false)
  })

  it('context_token 过期：入队、返回 false、并清掉落盘 token', async () => {
    const send = vi.fn(async () => { throw expiredTokenError() })
    setDeliveryBot(makeBot({ send }))

    await expect(sendToUser('u1', '提醒内容')).resolves.toBe(false)
    expect(hasPending('u1')).toBe(true)
    expect(writeFileMock).toHaveBeenCalledTimes(1) // 唯一一处触碰第三方库私有状态的实现
  })

  it('同一内容重复入队会被去重（回归：积压队列曾按周期重复累积）', async () => {
    const send = vi.fn(async () => { throw expiredTokenError() })
    setDeliveryBot(makeBot({ send }))

    for (let i = 0; i < 5; i++) await sendToUser('u1', '同一条提醒')

    const queued = getSettingValue<Array<{ text: string }>>('ilink_pending_u1', [])
    expect(queued).toHaveLength(1)
  })

  it('非 token 过期的失败向上抛出（交给调用方决定重试）', async () => {
    const send = vi.fn(async () => { throw new Error('network down') })
    setDeliveryBot(makeBot({ send }))

    await expect(sendToUser('u1', 'x')).rejects.toThrow('network down')
    expect(hasPending('u1')).toBe(false)
  })

  it('其他用户的失败不影响本用户', async () => {
    const send = vi.fn(async (userId: string) => {
      if (userId === 'u2') throw expiredTokenError()
    })
    setDeliveryBot(makeBot({ send }))

    await expect(sendToUser('u1', 'a')).resolves.toBe(true)
    await expect(sendToUser('u2', 'b')).resolves.toBe(false)
    expect(hasPending('u1')).toBe(false)
    expect(hasPending('u2')).toBe(true)
  })
})

describe('flushPending', () => {
  it('把积压合并成一条补发，并清空队列', async () => {
    const send = vi.fn(async () => {})
    setDeliveryBot(makeBot({ send }))
    // 直接构造积压
    const { setSetting } = await import('../services/settings.service.js')
    setSetting('ilink_pending_u1', [{ text: '第一条', at: 1 }, { text: '第二条', at: 2 }])

    await expect(flushPending('u1')).resolves.toBe(2)
    expect(send).toHaveBeenCalledWith('u1', '第一条\n\n---\n\n第二条')
    expect(hasPending('u1')).toBe(false)
  })

  it('补发失败时保留队列等待下次', async () => {
    const send = vi.fn(async () => { throw new Error('still offline') })
    setDeliveryBot(makeBot({ send }))
    const { setSetting } = await import('../services/settings.service.js')
    setSetting('ilink_pending_u1', [{ text: '待补发', at: 1 }])

    await expect(flushPending('u1')).resolves.toBe(0)
    expect(hasPending('u1')).toBe(true)
  })

  it('无积压时不做任何事', async () => {
    const send = vi.fn(async () => {})
    setDeliveryBot(makeBot({ send }))
    await expect(flushPending('u1')).resolves.toBe(0)
    expect(send).not.toHaveBeenCalled()
  })
})

describe('withInflight', () => {
  it('同一 key 并发时只执行一次，后来者得到 undefined', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    const fn = vi.fn(async () => { await gate; return 'done' })

    const first = withInflight('k', fn)
    const second = withInflight('k', fn)
    release()

    await expect(first).resolves.toBe('done')
    await expect(second).resolves.toBeUndefined()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('不同 key 互不影响', async () => {
    const fn = vi.fn(async () => 'ok')
    await Promise.all([withInflight('a', fn), withInflight('b', fn)])
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('抛错后释放键，允许后续重试', async () => {
    const failing = vi.fn(async () => { throw new Error('boom') })
    await expect(withInflight('k2', failing)).rejects.toThrow('boom')
    await expect(withInflight('k2', async () => 'ok')).resolves.toBe('ok')
  })
})

describe('getLastSentAt / markSentAt', () => {
  it('未记录返回 null；记录后可读回', () => {
    expect(getLastSentAt('proactive', 'u1')).toBeNull()
    markSentAt('proactive', 'u1', 1789473659113)
    expect(getLastSentAt('proactive', 'u1')).toBe(1789473659113)
  })

  it('键名与历史数据一致（ilink_<channel>_last_sent_<userId>）', () => {
    markSentAt('proactive', 'u9', 123)
    const row = connectDatabase().prepare("SELECT key FROM settings WHERE key LIKE '%last_sent%'").get() as { key: string }
    expect(row.key).toBe('ilink_proactive_last_sent_u9')
  })

  it('通道之间互不干扰', () => {
    markSentAt('proactive', 'u1', 100)
    markSentAt('reminder', 'u1', 200)
    expect(getLastSentAt('proactive', 'u1')).toBe(100)
    expect(getLastSentAt('reminder', 'u1')).toBe(200)
  })
})
