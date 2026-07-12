import type { StreamFn, AgentTool, AgentMessage } from '@earendil-works/pi-agent-core'
import type { Model, Message } from '@earendil-works/pi-ai'
import { listTools } from '../tool-config.service.js'
import { getEnabledSkills } from '../skill-config.service.js'
import { getBuiltinToolMap } from './builtin-tools.js'
import { Agent } from '@earendil-works/pi-agent-core'

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export class AgentPool {
  private agents = new Map<string, InstanceType<typeof Agent>>()

  constructor(
    private readonly streamFn: StreamFn,
    private readonly tools: AgentTool[],
    private readonly model: Model<'openai-completions'>,
    private readonly getApiKey: (provider: string) => string | undefined,
    private readonly defaultSystemPrompt: string,
  ) {}

  getOrCreate(id: string, historyLoader: () => Message[]): InstanceType<typeof Agent> {
    const existing = this.agents.get(id)
    if (existing) return existing
    const history = historyLoader()
    const agent = new Agent({
      streamFn: this.streamFn,
      getApiKey: this.getApiKey,
      initialState: { model: this.model, systemPrompt: this.defaultSystemPrompt, tools: this.tools, messages: history as AgentMessage[] },
    })
    this.agents.set(id, agent)
    return agent
  }

  remove(id: string): void { this.agents.delete(id) }
  get(id: string): InstanceType<typeof Agent> | undefined { return this.agents.get(id) }
  shutdown(): void { this.agents.clear() }
}

export function loadToolsFromDb(): AgentTool[] {
  const builtinMap = getBuiltinToolMap()
  const dbTools = listTools().filter(t => t.enabled)
  const result: AgentTool[] = []
  for (const dbTool of dbTools) {
    const builtin = builtinMap.get(dbTool.name)
    if (builtin) {
      const description = dbTool.description || builtin.description
      const instruction = dbTool.instruction || ''
      result.push({ ...builtin, description: instruction ? `${description}\n\n${instruction}` : description })
    }
  }
  return result
}

export async function loadSkillPrompt(): Promise<string> {
  const skills = await getEnabledSkills()
  const dbTools = listTools().filter(t => t.enabled)
  const builtinMap = getBuiltinToolMap()
  const textOnlyTools = dbTools.filter(t => !builtinMap.has(t.name))

  const parts: string[] = []

  if (skills.length > 0) {
    parts.push('以下技能提供特定任务的专项指令，当任务匹配技能描述时请遵循其指引：')
    parts.push('<available_skills>')
    for (const skill of skills) {
      parts.push(`  <skill>\n    <name>${escapeXml(skill.name)}</name>\n    <content>\n${skill.content}\n    </content>\n  </skill>`)
    }
    parts.push('</available_skills>')
  }

  for (const tool of textOnlyTools) {
    const text = tool.instruction || tool.description
    if (text) parts.push(`\n## Tool: ${tool.name}\n${text}`)
  }

  return parts.join('\n')
}
