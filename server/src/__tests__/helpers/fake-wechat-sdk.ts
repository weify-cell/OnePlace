/**
 * 外部微信 SDK（`@wechatbot/wechatbot`）的测试替身。
 *
 * 这是**系统边界**，可以 mock；自家模块一律不 mock（见 tdd skill 的 mocking.md）。
 * 替身照着真 SDK 的可观察行为写：
 * - `login()` 在凭证恢复路径上也会 emit 'login'（真 SDK 无条件 emit）
 * - `start()` / `stop()` 维护 `isRunning`（真 SDK 的 `isRunning` 就是轮询开关）
 */

export interface FakeWeChatBotInstance {
  isRunning: boolean
  handlers: Map<string, Array<(...args: unknown[]) => void>>
  emit: (event: string, ...args: unknown[]) => void
}

export const instances: FakeWeChatBotInstance[] = []

export function resetInstances(): void {
  instances.length = 0
}

/** 最近创建的那个实例（被测代码一次运行态只持有一个） */
export function lastInstance(): FakeWeChatBotInstance | undefined {
  return instances[instances.length - 1]
}

export class WeChatBot implements FakeWeChatBotInstance {
  handlers = new Map<string, Array<(...args: unknown[]) => void>>()
  isRunning = false

  constructor() {
    instances.push(this)
  }

  on(event: string, handler: (...args: unknown[]) => void): void {
    const list = this.handlers.get(event) ?? []
    list.push(handler)
    this.handlers.set(event, list)
  }

  onMessage(): void {}

  async login(): Promise<void> {
    this.handlers.get('login')?.forEach(handler => handler({ accountId: 'acc' }))
  }

  async start(): Promise<void> {
    this.isRunning = true
  }

  stop(): void {
    this.isRunning = false
  }

  async send(): Promise<void> {}

  async reply(): Promise<void> {}

  async sendTyping(): Promise<void> {}

  emit(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.forEach(handler => handler(...args))
  }
}
