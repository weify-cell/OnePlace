/**
 * 并发去重：同一 key 同时只允许一个任务在跑。
 *
 * 这是通用的并发原语，不属于任何业务模块：投递（防重复发送）、
 * 记忆整理（防同一用户并跑）、报告生成都在用。
 * 纯内存：它只关乎并发，不关乎持久化。
 */

const inflight = new Set<string>()

/**
 * 执行 fn；若已有同 key 任务在跑则跳过并返回 undefined。
 * fn 抛错时会释放 key，允许后续重试。
 */
export async function withInflight<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (inflight.has(key)) return undefined
  inflight.add(key)
  try {
    return await fn()
  } finally {
    inflight.delete(key)
  }
}

/** 当前是否有同 key 任务在跑。 */
export function isInflight(key: string): boolean {
  return inflight.has(key)
}

/**
 * 同 key 排队执行：后来的任务等前一个结束（与 `withInflight` 的「跳过」相反）。
 *
 * 用在「同一个 agent 不能被两个回合同时驱动」这类场景：聊天消息不能因为忙就被丢掉。
 * 前一个抛错不会卡死队列（错误会正常抛给它的调用方，队列继续往下走）。
 */
const queues = new Map<string, Promise<unknown>>()

export function withQueue<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(() => fn())
  const settled = run.catch(() => undefined)
  queues.set(key, settled)
  // 队列空了就把 key 清掉，不至于按 agent 无限积累
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key)
  })
  return run
}
