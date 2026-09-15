import { describe, expect, it, vi } from 'vitest'
import { isInflight, withInflight } from '../utils/inflight.js'

describe('withInflight — 通用并发去重', () => {
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
