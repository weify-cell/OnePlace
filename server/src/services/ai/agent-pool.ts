import type { StreamFn, AgentTool, AgentMessage } from '@earendil-works/pi-agent-core'
import type { Model, Message } from '@earendil-works/pi-ai'
import { listTools } from '../tool-config.service.js'
import { getEnabledSkills } from '../skill-config.service.js'
import { getBuiltinToolMap } from './builtin-tools.js'
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

/** 从 DB 加载启用的工具，匹配内置 execute 函数 */
export function loadToolsFromDb(): AgentTool[] {
  const builtinMap = getBuiltinToolMap()
  const dbTools = listTools().filter(t => t.enabled)
  const result: AgentTool[] = []

  for (const dbTool of dbTools) {
    const builtin = builtinMap.get(dbTool.name)
    if (builtin) {
      const description = dbTool.description || builtin.description
      const instruction = dbTool.instruction || ''
      const mergedDescription = instruction
        ? `${description}\n\n${instruction}`
        : description
      result.push({ ...builtin, description: mergedDescription })
    }
  }

  const names = dbTools.map(t => t.name)
  const dupes = names.filter((n, i) => names.indexOf(n) !== i)
  if (dupes.length > 0) {
    console.warn(`[agent-pool] duplicate tool names: ${[...new Set(dupes)].join(', ')}`)
  }

  return result
}

/** 加载启用的 skills 和纯文本工具，格式化为 prompt 追加文本 */
export async function loadSkillPrompt(): Promise<string> {
  const skills = await getEnabledSkills()
  const dbTools = listTools().filter(t => t.enabled)
  const builtinMap = getBuiltinToolMap()
  const textOnlyTools = dbTools.filter(t => !builtinMap.has(t.name))

  console.log(`[agent-pool] loadSkillPrompt: ${skills.length} skills, ${textOnlyTools.length} text-only tools`)
  for (const skill of skills) {
    console.log(`[agent-pool]   skill: ${skill.name} content=${skill.content.slice(0, 50)}`)
  }

  const parts: string[] = []
  for (const skill of skills) {
    parts.push(`\n## Skill: ${skill.name}\n${skill.content}`)
  }
  for (const tool of textOnlyTools) {
    const text = tool.instruction || tool.description
    if (text) parts.push(`\n## Tool: ${tool.name}\n${text}`)
  }
  const result = parts.join('\n')
  console.log(`[agent-pool] loadSkillPrompt result: ${result.length} chars`)
  return result
}
