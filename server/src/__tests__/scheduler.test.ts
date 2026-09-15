import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isJobRunning,
  normalizeIntervalMinutes,
  restartJob,
  startJob,
  stopAllJobs,
  stopJob,
  type SubsystemJob
} from '../services/wechat/scheduler.js'

/** 构造一个测试用作业；run 与 cleanup 均默认用 spy。 */
function makeJob(name: string, over: Partial<SubsystemJob> = {}): SubsystemJob {
  return {
    name,
    run: vi.fn(),
    intervalMinutes: () => 1,
    ...over
  } as SubsystemJob
}

afterEach(() => {
  stopAllJobs()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('normalizeIntervalMinutes', () => {
  it('非法值回退到 60，避免 0/NaN 让 setInterval 变成忙循环', () => {
    expect(normalizeIntervalMinutes(0)).toBe(60)
    expect(normalizeIntervalMinutes(-5)).toBe(60)
    expect(normalizeIntervalMinutes(Number.NaN)).toBe(60)
    expect(normalizeIntervalMinutes(Number.POSITIVE_INFINITY)).toBe(60)
  })

  it('夹取到 [1, 1440] 分钟', () => {
    expect(normalizeIntervalMinutes(0.4)).toBe(1)
    expect(normalizeIntervalMinutes(30)).toBe(30)
    expect(normalizeIntervalMinutes(5000)).toBe(1440)
  })
})

describe('startJob', () => {
  it('省略首次延迟时，启动即执行一次（提醒服务依赖该语义）', () => {
    vi.useFakeTimers()
    const job = makeJob('immediate')

    startJob(job)
    expect(job.run).toHaveBeenCalledTimes(1)
    expect(isJobRunning('immediate')).toBe(true)

    vi.advanceTimersByTime(60_000)
    expect(job.run).toHaveBeenCalledTimes(2)
  })

  it('设置首次延迟时，延迟到点前不执行', () => {
    vi.useFakeTimers()
    const job = makeJob('delayed', { initDelayMs: 30_000 })

    startJob(job)
    expect(job.run).toHaveBeenCalledTimes(0)

    vi.advanceTimersByTime(29_999)
    expect(job.run).toHaveBeenCalledTimes(0)

    vi.advanceTimersByTime(1)
    expect(job.run).toHaveBeenCalledTimes(1)
  })

  it('重复启动被忽略（守卫），不会叠加定时器', () => {
    vi.useFakeTimers()
    const job = makeJob('once')

    startJob(job)
    startJob(job)
    startJob(job)

    vi.advanceTimersByTime(120_000)
    // 1 次立即执行 + 2 次到点，若叠加了 3 个定时器会是 7
    expect(job.run).toHaveBeenCalledTimes(3)
  })

  it('单次抛错被隔离，不打断后续 tick', () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const run = vi.fn(() => { throw new Error('boom') })

    startJob(makeJob('flaky', { run }))
    vi.advanceTimersByTime(120_000)
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('异步 rejection 被隔离，不产生 unhandledRejection', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const run = vi.fn(() => Promise.reject(new Error('async boom')))

    startJob(makeJob('async-flaky', { run }))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(run).toHaveBeenCalledTimes(2)
  })
})

describe('stopJob / restartJob', () => {
  it('停止后不再到点，并执行 cleanup', () => {
    vi.useFakeTimers()
    const cleanup = vi.fn()
    const job = makeJob('stoppable', { cleanup })

    startJob(job)
    stopJob('stoppable')
    expect(isJobRunning('stoppable')).toBe(false)
    expect(cleanup).toHaveBeenCalledTimes(1)

    const before = (job.run as ReturnType<typeof vi.fn>).mock.calls.length
    vi.advanceTimersByTime(180_000)
    expect((job.run as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before)
  })

  it('restartJob 只重建定时器以应用新间隔，不额外重跑首次执行', () => {
    vi.useFakeTimers()
    const cleanup = vi.fn()
    let interval = 60
    const intervalSource = vi.fn(() => interval)
    const run = vi.fn()
    const job = makeJob('retunable', { cleanup, intervalMinutes: intervalSource, run })

    startJob(job)
    expect(intervalSource).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(1) // 无首次延迟 → 启动即一次

    interval = 5
    restartJob('retunable')
    expect(cleanup).not.toHaveBeenCalled()
    expect(intervalSource).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenCalledTimes(1) // 重建不定额外地立即执行

    // 新间隔 5 分钟生效：10 分钟内跑 2 次（若仍是 60 分钟会是 0 次）
    vi.advanceTimersByTime(10 * 60_000)
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('restartJob 对未运行的作业不做任何事', () => {
    const job = makeJob('never-started')
    restartJob(job.name)
    expect(isJobRunning(job.name)).toBe(false)
    expect(job.run).not.toHaveBeenCalled()
  })
})
