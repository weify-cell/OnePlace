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
import { buildMemoryUserContent, buildSystemPrompt, composePrompt, renderTemplate } from '../services/ai/prompt.js'
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
    expect(content).toContain('u1')
    expect(content).toContain('2026-09-10')
    expect(content).toContain('用户: 你好')
    expect(content).not.toContain('{')
  })

  it('设置覆盖时使用自定义模板', () => {
    setSetting('ilink_memory_user_template', '自定义 {userId}')
    expect(buildMemoryUserContent({ userId: 'u9' })).toBe('自定义 u9')
  })

  it('默认模板来自唯一来源（prompt-defaults）', () => {
    expect(DEFAULT_MEMORY_USER_TEMPLATE).toContain('{userId}')
    expect(DEFAULT_MEMORY_USER_TEMPLATE).toContain('{recordCount}')
  })
})
