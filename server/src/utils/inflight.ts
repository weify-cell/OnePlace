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
