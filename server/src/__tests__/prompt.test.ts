import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../database/index.js', async () => {
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      description TEXT NOT NULL DEFAULT ''
    );
  `)
  return { connectDatabase: () => db }
})

// 技能提示词来自 agent-pool（内含 skills 表与文件读取），此处只需它的拼接结果
vi.mock('../services/ai/agent-pool.js', () => ({
  loadSkillPrompt: vi.fn(async () => '## Skill: demo\n技能内容')
}))

import { connectDatabase } from '../database/index.js'
import { setSetting } from '../services/settings.service.js'
import { buildMemoryUserContent, buildSystemPrompt, composePrompt, renderTemplate, resolvePromptSettings } from '../services/ai/prompt.js'
import { loadSkillPrompt } from '../services/ai/agent-pool.js'
import {
  DEFAULT_CHAT_SYSTEM_PROMPT,
  DEFAULT_ILINK_LEARNING_PROMPT,
  DEFAULT_ILINK_SYSTEM_PROMPT,
  DEFAULT_MEMORY_SYSTEM_PROMPT,
  DEFAULT_NOTE_TOOLS_PROMPT,
  DEFAULT_PROACTIVE_SYSTEM_PROMPT,
  DEFAULT_REPORT_SYSTEM_PROMPT
} from '../services/prompt-defaults.js'
import { DEFAULT_MEMORY_USER_TEMPLATE } from '../services/prompt-defaults.js'

beforeEach(() => {
  connectDatabase().prepare('DELETE FROM settings').run()
  vi.mocked(loadSkillPrompt).mockClear()
})

describe('renderTemplate', () => {
  it('替换全部出现处（而非只替换第一处）', () => {
    expect(renderTemplate('{topic} 与 {topic} 与 {other}', { topic: 'A', other: 'B' })).toBe('A 与 A 与 B')
  })

  it('未提供的占位符原样保留', () => {
    expect(renderTemplate('{a}-{b}', { a: '1' })).toBe('1-{b}')
  })
})

describe('composePrompt', () => {
  it('丢弃空值/纯空白，并按空行拼接', () => {
    expect(composePrompt(['a', '', '   ', undefined, null, 'b'])).toBe('a\n\nb')
  })
})

describe('buildSystemPrompt — 基础提示词按回合类型解析', () => {
  it('web-chat：开启工具用工具提示词，未开启用通用提示词', async () => {
    await expect(buildSystemPrompt({ kind: 'web-chat', toolsEnabled: true }))
      .resolves.toContain(DEFAULT_NOTE_TOOLS_PROMPT.slice(0, 20))
    await expect(buildSystemPrompt({ kind: 'web-chat', toolsEnabled: false }))
      .resolves.toContain(DEFAULT_CHAT_SYSTEM_PROMPT.slice(0, 20))
  })

  it('bot-chat：基础提示词 = ilink_system_prompt + 工具提示词', async () => {
    const p = await buildSystemPrompt({ kind: 'bot-chat' })
    expect(p).toContain(DEFAULT_ILINK_SYSTEM_PROMPT)
    expect(p).toContain(DEFAULT_NOTE_TOOLS_PROMPT)
  })

  it('learning：渲染 {topic} 且使用学习模式默认值', async () => {
    const p = await buildSystemPrompt({ kind: 'learning', topic: 'Python 装饰器' })
    expect(p).toContain('Python 装饰器')
    expect(p).not.toContain('{topic}')
    // 只比对占位符之前的前缀（常量里仍含 {topic}，渲染后已替换）
    expect(p).toContain(DEFAULT_ILINK_LEARNING_PROMPT.slice(0, 16))
  })

  it('proactive：人设 + 工具提示词', async () => {
    const p = await buildSystemPrompt({ kind: 'proactive' })
    expect(p).toContain(DEFAULT_PROACTIVE_SYSTEM_PROMPT)
    expect(p).toContain(DEFAULT_NOTE_TOOLS_PROMPT)
  })

  it('report：渲染 {type}，且不追加技能与记忆', async () => {
    const p = await buildSystemPrompt({ kind: 'report', reportType: '日报' })
    expect(p).toContain('日报')
    expect(p).not.toContain('{type}')
    expect(p).toContain(DEFAULT_REPORT_SYSTEM_PROMPT.slice(0, 10))
    expect(vi.mocked(loadSkillPrompt)).not.toHaveBeenCalled()
  })

  it('memory：只用记忆整理系统提示词，不追加技能', async () => {
    const p = await buildSystemPrompt({ kind: 'memory' })
    expect(p).toBe(DEFAULT_MEMORY_SYSTEM_PROMPT)
    expect(vi.mocked(loadSkillPrompt)).not.toHaveBeenCalled()
  })
})

describe('buildSystemPrompt — 规则表：技能与记忆提示词的取舍', () => {
  it('bot-chat 与 learning 追加技能和该用户记忆提示词', async () => {
    for (const kind of ['bot-chat', 'learning'] as const) {
      const p = await buildSystemPrompt({ kind, topic: 'T', memoryPrompt: '【记忆】用户喜欢美式' })
      expect(p).toContain('技能内容')
      expect(p).toContain('【记忆】用户喜欢美式')
    }
  })

  it('proactive 与 web-chat 追加技能但不追加记忆提示词', async () => {
    for (const kind of ['proactive', 'web-chat'] as const) {
      const p = await buildSystemPrompt({ kind, memoryPrompt: '【记忆】不该出现' })
      expect(p).toContain('技能内容')
      expect(p).not.toContain('不该出现')
    }
  })

  it('记忆提示词仅对允许的回合类型生效', async () => {
    // web-chat 传入 memoryPrompt 也不应出现
    const p = await buildSystemPrompt({
      kind: 'web-chat',
      toolsEnabled: true,
      memoryPrompt: '【记忆】不该出现'
    })
    expect(p).not.toContain('不该出现')
  })
})

describe('buildSystemPrompt — 设置优先，空串视为未设置', () => {
  it('设置存在时覆盖默认值', async () => {
    setSetting('ilink_system_prompt', '自定义人设')
    const p = await buildSystemPrompt({ kind: 'bot-chat' })
    expect(p).toContain('自定义人设')
    expect(p).not.toContain(DEFAULT_ILINK_SYSTEM_PROMPT)
  })

  it('空串设置回落到默认值（避免迁移种子空串遮蔽默认值）', async () => {
    setSetting('note_tools_prompt', '')
    const p = await buildSystemPrompt({ kind: 'web-chat', toolsEnabled: true })
    expect(p).toContain(DEFAULT_NOTE_TOOLS_PROMPT)
  })
})

describe('resolvePromptSettings — 设置页与运行时同源（不变式）', () => {
  it('设置全空时，设置页解析出的每一项都等于默认值来源', () => {
    const prompts = resolvePromptSettings()
    expect(prompts.system_prompt).toBe(DEFAULT_ILINK_SYSTEM_PROMPT)
    expect(prompts.note_tools_prompt).toBe(DEFAULT_NOTE_TOOLS_PROMPT)
    expect(prompts.learning_prompt).toBe(DEFAULT_ILINK_LEARNING_PROMPT)
    expect(prompts.proactive_system_prompt).toBe(DEFAULT_PROACTIVE_SYSTEM_PROMPT)
    expect(prompts.memory_system_prompt).toBe(DEFAULT_MEMORY_SYSTEM_PROMPT)
  })

  it('设置页展示的基础提示词就是运行时实际使用的那一份', async () => {
    const prompts = resolvePromptSettings()
    const botChat = await buildSystemPrompt({ kind: 'bot-chat' })
    expect(botChat).toContain(prompts.system_prompt)
    expect(botChat).toContain(prompts.note_tools_prompt)

    // 回归：getILinkConfig 曾自带一份内联副本，与设置页/运行时不同源
    setSetting('ilink_system_prompt', '自定义人设')
    expect(resolvePromptSettings().system_prompt).toBe('自定义人设')
    await expect(buildSystemPrompt({ kind: 'bot-chat' })).resolves.toContain('自定义人设')
  })

  it('空串设置在两侧同样被穿透（不再只在一侧加守卫）', async () => {
    setSetting('note_tools_prompt', '')
    expect(resolvePromptSettings().note_tools_prompt).toBe(DEFAULT_NOTE_TOOLS_PROMPT)
    await expect(buildSystemPrompt({ kind: 'web-chat', toolsEnabled: true }))
      .resolves.toContain(DEFAULT_NOTE_TOOLS_PROMPT)
  })
})

describe('记忆整理的提示词：去噪规则与归属', () => {
  it('系统提示词写明三类不该进记忆的内容', async () => {
    const p = await buildSystemPrompt({ kind: 'memory' })
    // 实测噪声的来源：助手自身行为、待办状态变更、正文里嵌用户 ID（184/210 条中招）
    expect(p).toContain('助手自己')
    expect(p).toContain('待办')
    expect(p).toContain('微信 ID')
  })

  it('系统提示词不再让模型传 user_id（归属改由服务端注入）', async () => {
    await expect(buildSystemPrompt({ kind: 'memory' })).resolves.not.toContain('user_id')
  })

  it('默认用户消息模板不再要求传 user_id，也不再提供用户 ID 变量', () => {
    const c = buildMemoryUserContent({
      beijingTime: '[2026/10/12 00:30:00 星期一 北京时间]',
      userId: 'u1',
      memoryDate: '2026-10-11',
      recordCount: '1',
      transcript: '用户: 你好'
    })
    expect(c).not.toContain('user_id')
    expect(c).not.toContain('u1')
    expect(c).toContain('2026-10-11')
    expect(c).toContain('用户: 你好')
  })

  it('系统提示词写明类型与主题键：状态型必须带主题、状态归并且不重复叙述', async () => {
    const p = await buildSystemPrompt({ kind: 'memory' })
    expect(p).toContain('kind')
    expect(p).toContain('topic')
    expect(p).toContain('取代')
    expect(p).toContain('没有变化')
  })

  it('系统提示词给出「给未分类记忆补标注」这条唯一允许重复声明的路径', async () => {
    // 没有这句，补标注能力在产品里永远不会被调用（提示词只说「请勿重复抽取」）
    const p = await buildSystemPrompt({ kind: 'memory' })
    expect(p).toContain('未分类')
    expect(p).toContain('一字不改')
  })
})

describe('buildMemoryUserContent', () => {
  it('注入全部变量', () => {
    const content = buildMemoryUserContent({
      beijingTime: '[2026-09-11 00:30:00 星期五 北京时间]',
      userId: 'u1',
      memoryDate: '2026-09-10',
      recordCount: '3',
      transcript: '用户: 你好',
      recentMemories: ''
    })
    expect(content).toContain('2026-09-10')
    expect(content).toContain('3')
    expect(content).toContain('用户: 你好')
    expect(content).not.toContain('{')
  })

  it('设置覆盖时使用自定义模板', () => {
    setSetting('ilink_memory_user_template', '自定义 {userId}')
    expect(buildMemoryUserContent({ userId: 'u9' })).toBe('自定义 u9')
  })

  it('默认模板来自唯一来源（prompt-defaults）', () => {
    expect(DEFAULT_MEMORY_USER_TEMPLATE).toContain('{memoryDate}')
    expect(DEFAULT_MEMORY_USER_TEMPLATE).toContain('{recordCount}')
  })
})

describe('「跳过」规则只出现在允许跳过的回合里', () => {
  it('bot 回复与主动搭话拿得到规则', async () => {
    const bot = await buildSystemPrompt({ kind: 'bot-chat' })
    const proactive = await buildSystemPrompt({ kind: 'proactive' })

    expect(bot).toContain('SKIP')
    expect(proactive).toContain('SKIP')
  })

  it('bot 回复的规则要挡住「该回却不回」：提问、需要信息、情绪类不许跳过', async () => {
    const bot = await buildSystemPrompt({ kind: 'bot-chat' })

    expect(bot).toContain('提问')
  })

  it('两个档位不能串：bot 默认必须回，主动搭话是"跳过是常态"', async () => {
    const bot = await buildSystemPrompt({ kind: 'bot-chat' })
    const proactive = await buildSystemPrompt({ kind: 'proactive' })

    // 让你提问时不许沉默的那句，只属于 bot 回复
    expect(bot).toContain('必须回')
    expect(proactive).not.toContain('必须回')
  })

  it('学习模式没有跳过的权力（你主动开的会话，它不能说走就走）', async () => {
    const prompt = await buildSystemPrompt({ kind: 'learning', topic: 'Rust' })

    expect(prompt).not.toContain('SKIP')
  })

  it('其它回合（web 对话 / 报告 / 记忆整理）也拿不到', async () => {
    expect(await buildSystemPrompt({ kind: 'web-chat', toolsEnabled: true })).not.toContain('SKIP')
    expect(await buildSystemPrompt({ kind: 'report', reportType: '日报' })).not.toContain('SKIP')
    expect(await buildSystemPrompt({ kind: 'memory' })).not.toContain('SKIP')
  })

  it('设置页里把提示词改成什么都盖不掉它（能力是机制，不是话术）', async () => {
    setSetting('ilink_system_prompt', '你是我的私人助理，说话简短。')

    const prompt = await buildSystemPrompt({ kind: 'bot-chat' })

    expect(prompt).toContain('你是我的私人助理')
    expect(prompt).toContain('SKIP')
  })
})
