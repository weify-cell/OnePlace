import type { StreamFn, AgentTool, AgentMessage } from '@earendil-works/pi-agent-core'
import type { Model, Message } from '@earendil-works/pi-ai'

const { Agent } = await import('@earendil-works/pi-agent-core') as typeof import('@earendil-works/pi-agent-core')

/**
 * AgentPool 管理 Agent 实例生命周期。
 * 内部使用 Map 结构，无过期淘汰策略。
 */
export class AgentPool {
  private agents = new Map<string, InstanceType<typeof Agent>>()

  constructor(
    private readonly streamFn: StreamFn,
    private readonly tools: AgentTool[],
    private readonly model: Model<'openai-completions'>,
    private readonly getApiKey: (provider: string) => string | undefined,
    private readonly defaultSystemPrompt: string,
  ) {}

  /**
   * 获取或创建 Agent。
   * 不存在则新建，并从 historyLoader 加载历史消息。
   */
  getOrCreate(id: string, historyLoader: () => Message[]): InstanceType<typeof Agent> {
    const existing = this.agents.get(id)
    if (existing) return existing

    const history = historyLoader()
    const agent = new Agent({
      streamFn: this.streamFn,
      getApiKey: this.getApiKey,
      initialState: {
        model: this.model,
        systemPrompt: this.defaultSystemPrompt,
        tools: this.tools,
        messages: history as AgentMessage[],
      },
    })
    this.agents.set(id, agent)
    return agent
  }

  /** 销毁指定 Agent */
  remove(id: string): void {
    this.agents.delete(id)
  }

  /** 获取指定 Agent，不存在返回 undefined */
  get(id: string): InstanceType<typeof Agent> | undefined {
    return this.agents.get(id)
  }

  /** 关闭所有 Agent */
  shutdown(): void {
    this.agents.clear()
  }
}
