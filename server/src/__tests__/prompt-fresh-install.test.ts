import { describe, expect, it, vi } from 'vitest'

// 真库 + 真迁移：本文件要断言的正是「迁移跑完之后」的状态
vi.mock('../database/index.js', async () => {
  const { connectDatabase } = await import('./helpers/test-db.js')
  return { connectDatabase }
})

import { connectDatabase } from '../database/index.js'
import { buildMemoryUserContent, buildSystemPrompt } from '../services/ai/prompt.js'

/**
 * 新装环境的记忆整理提示词。
 *
 * 本文件**故意不清空 settings**：它要看的正是「只跑过迁移的新库」的样子。
 * （先前把同样的断言写在会 `DELETE FROM settings` 的用例里，于是它断言的其实是
 * 代码默认值，而不是新装环境真正会用的那份提示词——那种测试只会给假安全感。）
 *
 * 背景：迁移 028 曾把两份记忆提示词种进 settings，而 DB 值会遮蔽代码默认值。
 * 于是「只改 prompt-defaults.ts」对新装环境完全生效不了，去噪规则会静默失守。
 */

const MEMORY_PROMPT_KEYS = ['ilink_memory_system_prompt', 'ilink_memory_user_template']

describe('新装环境的记忆整理提示词', () => {
  it('迁移不种记忆提示词覆盖值——让代码默认值成为唯一出处', () => {
    const rows = connectDatabase()
      .prepare(`SELECT key FROM settings WHERE key IN (${MEMORY_PROMPT_KEYS.map(() => '?').join(',')})`)
      .all(...MEMORY_PROMPT_KEYS) as Array<{ key: string }>
    expect(rows).toEqual([])
  })

  it('整理系统提示词就是带去噪规则的那一份（不含 user_id 参数说明）', async () => {
    const system = await buildSystemPrompt({ kind: 'memory' })
    expect(system).not.toContain('user_id')
    expect(system).toContain('助手自己')
    expect(system).toContain('微信 ID')
  })

  it('整理用户模板不再要求传 user_id，也不再把用户 ID 交给模型', () => {
    const template = buildMemoryUserContent({
      beijingTime: '[北京时间]',
      userId: 'u1',
      memoryDate: '2026-10-11',
      recordCount: '1',
      transcript: '用户: 你好'
    })
    expect(template).not.toContain('user_id')
    expect(template).not.toContain('u1')
  })
})
