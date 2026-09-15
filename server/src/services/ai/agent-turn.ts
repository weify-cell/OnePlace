import type { AgentEvent, AgentMessage } from '@earendil-works/pi-agent-core'
import { AgentPool, loadToolsFromDb } from './agent-pool.js'
import { createModel, createStreamFn, convertMessages, extractApiKey, type ChatMessage } from './pi-ai.adapter.js'
import { getSettingValue } from '../settings.service.js'

/**
 * 回合（turn）接缝：跑一轮完整 agent loop 并返回最终 assistant 文本。
 *
 * 此前这套配方写在三处（bot 处理器、report/memory/proactive 共用的 runAgentTurn、
 * chat.service 自己的内联副本），而三种写法对「什么算回复」给出三种不同答案。
 * 这里给出唯一答案：取 agent_end 消息序列里最后一条 assistant 文本。
 *
 * 池按 provider:model 缓存，Web 对话与微信层共用同一处注册表。
 */

export interface AgentTurnRequest {
  /** 池中键：同一个键复用同一 agent 实例（连同其上下文） */
  agentId: string
  /** 本回合生效的 system prompt（由 ai/prompt.ts 拼装） */
  systemPrompt: string
  /** 用户输入 */
  userContent: string
  /** 历史消息加载器；仅在 agent 首次创建时调用 */
  history?: () => ChatMessage[]
  /** 回合结束后销毁该 agent（一次性任务型回合用） */
  ephemeral?: boolean
  /** 模型覆盖；省略则取默认提供商/模型设置 */
  provider?: string
  model?: string
  /** 逐事件回调（日志等副作用）；不影响结果提取 */
  onEvent?: (event: AgentEvent) => void
}

/**
 * agent 池的层作用域。
 *
 * Web 对话与微信层共用同一处池注册表，但生命周期互不隶属：
 * 停止微信 bot 不得连带清掉 Web 对话的上下文，反之亦然。
 * 因此 agentId 统一带层前缀，销毁按层限定。
 */
export const AGENT_SCOPE_WEB = 'web:'
export const AGENT_SCOPE_WECHAT = 'wx:'
export type AgentScope = typeof AGENT_SCOPE_WEB | typeof AGENT_SCOPE_WECHAT

/** Web 对话层的 agent id（一个对话一个实例）。 */
export function webAgentId(conversationId: number): string {
  return `${AGENT_SCOPE_WEB}conv:${conversationId}`
}

/** 微信层的 agent id（一个用户一个实例）。 */
export function wechatAgentId(userId: string): string {
  return `${AGENT_SCOPE_WECHAT}${userId}`
}

/** 微信层一次性任务的 agent id（报告/记忆整理/主动聊天，回合后销毁）。 */
export function wechatTaskAgentId(task: string, key: string): string {
  return `${AGENT_SCOPE_WECHAT}${task}:${key}`
}

/** agent id 是否属于某一层。 */
export function belongsToScope(agentId: string, scope: AgentScope): boolean {
  return agentId.startsWith(scope)
}

/** 从消息序列末尾取最后一条 assistant 文本。 */
export function extractAssistantText(messages: AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      return m.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map(c => c.text)
        .join('')
    }
  }
  return ''
}

const pools = new Map<string, AgentPool>()

/** 取（或建立）provider:model 对应的 agent 池。 */
function getPool(provider: string, modelId: string): AgentPool {
  const key = `${provider}:${modelId}`
  let pool = pools.get(key)
  if (!pool) {
    pool = new AgentPool(
      createStreamFn(),
      loadToolsFromDb(),
      createModel(provider, modelId),
      (p) => extractApiKey(p),
      ''
    )
    pools.set(key, pool)
  }
  return pool
}

/** 解析本次回合使用的模型：显式传入优先，否则回落到默认提供商/模型设置。 */
function resolveModel(req: AgentTurnRequest): { provider: string; model: string } {
  return {
    provider: req.provider ?? getSettingValue<string>('default_provider', 'qwen'),
    model: req.model ?? getSettingValue<string>('default_model', 'qwen-turbo')
  }
}

/** 跑一轮完整 agent loop，返回最终 assistant 文本。 */
export async function runAgentTurn(req: AgentTurnRequest): Promise<string> {
  const { provider, model: modelId } = resolveModel(req)
  const pool = getPool(provider, modelId)

  const agent = pool.getOrCreate(req.agentId, () => convertMessages(req.history?.() ?? []))

  // 每个回合都重新装载工具与提示词，管理页的启停/编辑即时生效
  agent.state.tools = loadToolsFromDb()
  agent.state.systemPrompt = req.systemPrompt

  let reply = ''
  const unsub = agent.subscribe((event) => {
    req.onEvent?.(event)
    if (event.type === 'agent_end') {
      reply = extractAssistantText(event.messages)
    }
  })

  try {
    await agent.prompt(convertMessages([{ role: 'user', content: req.userContent }]))
    await agent.waitForIdle()
  } finally {
    unsub()
    if (req.ephemeral) pool.remove(req.agentId)
  }

  return reply
}

/** 销毁指定 agent（例如用户清空上下文时）。 */
export function removeAgent(agentId: string): void {
  for (const pool of pools.values()) {
    if (pool.get(agentId)) {
      pool.remove(agentId)
      return
    }
  }
}

/**
 * 关闭某一层的全部 agent。
 * 作用域限定是必要的：两层共用地注册表，清错层会丢掉另一层的会话上下文。
 */
export function shutdownAgents(scope: AgentScope): void {
  for (const pool of pools.values()) {
    for (const agentId of pool.ids()) {
      if (belongsToScope(agentId, scope)) pool.remove(agentId)
    }
  }
}
