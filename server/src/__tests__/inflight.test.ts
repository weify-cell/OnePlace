import { describe, expect, it, vi } from 'vitest'
import { isInflight, withInflight, withQueue } from '../utils/inflight.js'

/** 让出一轮宏任务：withQueue 通过 promise 链启动，需要不止一个微任务 tick */
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

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

describe('withQueue —— 同 key 串行（与 withInflight 的「跳过」相反）', () => {
  it('后一个任务等前一个结束才开始', async () => {
    const order: string[] = []
    let releaseFirst: () => void = () => {}
    const first = withQueue('k1', async () => {
      order.push('first:start')
      await new Promise<void>(resolve => { releaseFirst = resolve })
      order.push('first:end')
    })
    const second = withQueue('k1', async () => { order.push('second') })

    await tick() // 让排队链把第一个任务推进到「已开始」
    expect(order).toEqual(['first:start']) // 第二个还没开始（不是跳过，是排队）
    releaseFirst()
    await Promise.all([first, second])
    expect(order).toEqual(['first:start', 'first:end', 'second'])
  })

  it('前一个抛错不会卡死队列，错误仍抛给它的调用方', async () => {
    const order: string[] = []
    const failing = withQueue('k2', async () => { order.push('failing'); throw new Error('boom') })
    const following = withQueue('k2', async () => { order.push('following') })

    await expect(failing).rejects.toThrow('boom')
    await expect(following).resolves.toBeUndefined()
    expect(order).toEqual(['failing', 'following'])
  })

  it('不同 key 互不阻塞（可并行）', async () => {
    const order: string[] = []
    let release: () => void = () => {}
    const a = withQueue('ka', async () => {
      order.push('a:start')
      await new Promise<void>(resolve => { release = resolve })
      order.push('a:end')
    })
    const b = withQueue('kb', async () => { order.push('b') })

    await b
    expect(order).toContain('b')      // b 没有被 a 挡住
    release()
    await a
  })
})
