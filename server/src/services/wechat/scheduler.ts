/**
 * 微信后台子系统的统一调度接缝。
 *
 * 四个子系统（提醒 / 主动聊天 / 报告 / 记忆整理）原先各自维护一份定时器生命周期：
 * 重复启动守卫、首次延迟、停止清理、单次异常隔离。这些规则只应存在一处——
 * 各子系统只声明「我叫什么、多久跑一次、跑什么」，启停交给这里。
 *
 * 间隔在这里做夹取：配置项来自 settings，可能被写成 0、负数或非数字，
 * 直接传给 setInterval 会退化成近似死循环。
 */

/** 一个周期性后台作业。 */
export interface SubsystemJob<TBot = unknown> {
  /** 唯一名字，用于启停、重建与状态查询 */
  name: string
  /** 到点执行；单次抛错只记录，不打断后续 tick */
  run: () => void | Promise<void>
  /** 间隔分钟数；启动与重建时读取，因此配置改动可直接生效 */
  intervalMinutes: () => number
  /** 首次执行前的延迟（毫秒）；省略则启动时立即执行一次 */
  initDelayMs?: number
  /** 启动前注入依赖（例如 WeChatBot 实例） */
  prepare?: (bot: TBot) => void
  /** 停止时清理依赖 */
  cleanup?: () => void
}

interface RunningJob {
  job: SubsystemJob<never>
  interval: ReturnType<typeof setInterval>
  initTimer: ReturnType<typeof setTimeout> | null
}

const MIN_INTERVAL_MINUTES = 1
const MAX_INTERVAL_MINUTES = 24 * 60
const FALLBACK_INTERVAL_MINUTES = 60

const running = new Map<string, RunningJob>()

/** 间隔夹取：非法值回退到默认，避免 0/NaN 让 setInterval 变成忙循环。 */
export function normalizeIntervalMinutes(minutes: number): number {
  const value = Number(minutes)
  if (!Number.isFinite(value) || value <= 0) return FALLBACK_INTERVAL_MINUTES
  return Math.min(Math.max(value, MIN_INTERVAL_MINUTES), MAX_INTERVAL_MINUTES)
}

/** 构造到点回调；同步抛错与异步 rejection 都被隔离，否则会变成 unhandledRejection。 */
function makeTick(job: SubsystemJob<never>): () => void {
  return () => {
    try {
      const result = job.run()
      if (result && typeof (result as Promise<void>).catch === 'function') {
        (result as Promise<void>).catch(err => console.error(`[scheduler] ${job.name} tick failed:`, err))
      }
    } catch (err) {
      console.error(`[scheduler] ${job.name} tick failed:`, err)
    }
  }
}

/** 读取间隔并建立定时器，返回实际采用的分钟数（间隔只读一次）。 */
function createInterval(job: SubsystemJob<never>): { interval: ReturnType<typeof setInterval>; minutes: number } {
  const minutes = normalizeIntervalMinutes(job.intervalMinutes())
  return { interval: setInterval(makeTick(job), minutes * 60 * 1000), minutes }
}

function clearTimers(entry: RunningJob): void {
  if (entry.initTimer) clearTimeout(entry.initTimer)
  clearInterval(entry.interval)
}

/** 启动一个作业；已在运行则忽略（重复启动守卫）。 */
export function startJob(job: SubsystemJob<never>): void {
  if (running.has(job.name)) {
    console.log(`[scheduler] ${job.name} already running`)
    return
  }

  const { interval, minutes } = createInterval(job)
  const tick = makeTick(job)

  const entry: RunningJob = {
    job,
    interval,
    initTimer: null
  }

  if (job.initDelayMs && job.initDelayMs > 0) {
    entry.initTimer = setTimeout(() => {
      entry.initTimer = null
      tick()
    }, job.initDelayMs)
  } else {
    // 省略首次延迟 = 启动即跑一次（提醒服务依赖这个语义）
    tick()
  }

  running.set(job.name, entry)
  console.log(`[scheduler] ${job.name} started (interval: ${minutes}min${job.initDelayMs ? `, init delay: ${job.initDelayMs}ms` : ', immediate first tick'})`)
}

/** 停止一个作业并执行其清理。 */
export function stopJob(name: string): void {
  const entry = running.get(name)
  if (!entry) return
  clearTimers(entry)
  running.delete(name)
  entry.job.cleanup?.()
  console.log(`[scheduler] ${name} stopped`)
}

/**
 * 只重建定时器以应用新间隔（配置改动后调用），不重跑首次执行。
 * 未运行则不做任何事。
 */
export function restartJob(name: string): void {
  const entry = running.get(name)
  if (!entry) return
  clearInterval(entry.interval)
  const { interval, minutes } = createInterval(entry.job)
  entry.interval = interval
  console.log(`[scheduler] ${name} interval rebuilt (${minutes}min)`)
}

/** 作业是否在运行（状态查询用，替代各模块自己持有定时器变量）。 */
export function isJobRunning(name: string): boolean {
  return running.has(name)
}

/** 停止全部作业。 */
export function stopAllJobs(): void {
  for (const name of [...running.keys()]) stopJob(name)
}
