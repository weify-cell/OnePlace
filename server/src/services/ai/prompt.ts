import { getSettingValue } from '../settings.service.js'
import { loadSkillPrompt } from './agent-pool.js'
import {
  DEFAULT_CHAT_SYSTEM_PROMPT,
  DEFAULT_ILINK_LEARNING_PROMPT,
  DEFAULT_ILINK_SYSTEM_PROMPT,
  DEFAULT_MEMORY_SYSTEM_PROMPT,
  DEFAULT_MEMORY_USER_TEMPLATE,
  DEFAULT_NOTE_TOOLS_PROMPT,
  DEFAULT_PROACTIVE_SYSTEM_PROMPT,
  DEFAULT_PROACTIVE_USER_MESSAGE,
  DEFAULT_REPORT_SYSTEM_PROMPT
} from '../prompt-defaults.js'

/**
 * 回合提示词拼装——全库唯一出处。
 *
 * 此前「一个回合的 system prompt」在 5 处用 5 套规则拼装（web 对话、bot 对话、
 * 学习模式、主动聊天、报告 / 记忆），拼接顺序、是否带技能、是否带记忆提示词
 * 各写一遍；默认值也分成 4 份并已发生漂移。
 *
 * 现在：调用方只给「回合类型 + 少量变量」，这里的规则表决定用什么基础提示词、
 * 是否追加技能与记忆提示词。默认值只来自 prompt-defaults.ts。
 */

/** 回合类型。 */
export type TurnKind = 'web-chat' | 'bot-chat' | 'learning' | 'proactive' | 'report' | 'memory'

export interface SystemPromptRequest {
  kind: TurnKind
  /** web-chat：是否开启工具/知识库（决定用工具提示词还是通用提示词） */
  toolsEnabled?: boolean
  /** learning：学习主题 */
  topic?: string
  /** report：报告类型标签（日报 / 周报 / 月报） */
  reportType?: string
  /** bot-chat / learning：该用户近 30 天记忆提示词（由 memory 模块按 userId 生成） */
  memoryPrompt?: string
}

/**
 * 各类回合的附加规则（一张表，避免两张并行表随类型增长而失同步）。
 * skills：是否追加技能提示词；memory：是否追加该用户的记忆提示词。
 */
const TURN_RULES: Record<TurnKind, { skills: boolean; memory: boolean }> = {
  'web-chat': { skills: true, memory: false },
  'bot-chat': { skills: true, memory: true },
  learning: { skills: true, memory: true },
  proactive: { skills: true, memory: false },
  report: { skills: false, memory: false },
  memory: { skills: false, memory: false }
}

/** 渲染 `{var}` 占位符（替换全部出现处，而非只替换第一处）。 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  let out = template
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(value)
  }
  return out
}

/** 按顺序拼接非空段落，空值与纯空白被丢弃。 */
export function composePrompt(parts: Array<string | undefined | null>): string {
  return parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join('\n\n')
}

/** 读设置项；空串视为「未设置」而回落到默认值（避免种子空串遮蔽默认值）。 */
function setting(key: string, fallback: string): string {
  const value = getSettingValue<string>(key, fallback)
  return value && value.trim() ? value : fallback
}

/** 各类回合的基础提示词（设置优先，回落到 prompt-defaults.ts 的唯一默认值）。 */
function basePromptFor(req: SystemPromptRequest): string {
  switch (req.kind) {
    case 'web-chat':
      return req.toolsEnabled
        ? setting('note_tools_prompt', DEFAULT_NOTE_TOOLS_PROMPT)
        : DEFAULT_CHAT_SYSTEM_PROMPT

    case 'bot-chat':
      return composePrompt([
        setting('ilink_system_prompt', DEFAULT_ILINK_SYSTEM_PROMPT),
        setting('note_tools_prompt', DEFAULT_NOTE_TOOLS_PROMPT)
      ])

    case 'learning':
      return renderTemplate(
        setting('ilink_learning_prompt', DEFAULT_ILINK_LEARNING_PROMPT),
        { topic: req.topic ?? '' }
      )

    case 'proactive':
      return composePrompt([
        setting('ilink_proactive_chat_system_prompt', DEFAULT_PROACTIVE_SYSTEM_PROMPT),
        setting('note_tools_prompt', DEFAULT_NOTE_TOOLS_PROMPT)
      ])

    case 'report':
      return renderTemplate(DEFAULT_REPORT_SYSTEM_PROMPT, { type: req.reportType ?? '' })

    case 'memory':
      return setting('ilink_memory_system_prompt', DEFAULT_MEMORY_SYSTEM_PROMPT)
  }
}

/** 拼装一个回合的 system prompt。 */
export async function buildSystemPrompt(req: SystemPromptRequest): Promise<string> {
  const rules = TURN_RULES[req.kind]
  const skills = rules.skills ? await loadSkillPrompt() : ''
  const memory = rules.memory ? req.memoryPrompt : ''
  return composePrompt([basePromptFor(req), skills, memory])
}

/** 记忆整理的用户消息：取模板（设置优先）并注入变量。 */
export function buildMemoryUserContent(vars: Record<string, string>): string {
  return renderTemplate(setting('ilink_memory_user_template', DEFAULT_MEMORY_USER_TEMPLATE), vars)
}

/**
 * 设置页展示用的提示词解析。
 *
 * 与运行时（buildSystemPrompt）走同一套规则：同一个设置键、同一个默认值来源、
 * 空串一律视为未设置。因此不存在「页面显示的不是实际生效的」这种漂移。
 */
export function resolvePromptSettings(): {
  system_prompt: string
  note_tools_prompt: string
  proactive_system_prompt: string
  proactive_user_message: string
  learning_prompt: string
  memory_system_prompt: string
  memory_user_template: string
} {
  return {
    system_prompt: setting('ilink_system_prompt', DEFAULT_ILINK_SYSTEM_PROMPT),
    note_tools_prompt: setting('note_tools_prompt', DEFAULT_NOTE_TOOLS_PROMPT),
    proactive_system_prompt: setting('ilink_proactive_chat_system_prompt', DEFAULT_PROACTIVE_SYSTEM_PROMPT),
    proactive_user_message: setting('ilink_proactive_chat_user_message', DEFAULT_PROACTIVE_USER_MESSAGE),
    learning_prompt: setting('ilink_learning_prompt', DEFAULT_ILINK_LEARNING_PROMPT),
    memory_system_prompt: setting('ilink_memory_system_prompt', DEFAULT_MEMORY_SYSTEM_PROMPT),
    memory_user_template: setting('ilink_memory_user_template', DEFAULT_MEMORY_USER_TEMPLATE)
  }
}
