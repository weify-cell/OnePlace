import { beforeEach, describe, expect, it, vi } from 'vitest'

// 数据库换掉的是「连接」这个系统边界：内存真库 + 真迁移（见 helpers/test-db.ts）
vi.mock('../database/index.js', async () => {
  const { connectDatabase } = await import('./helpers/test-db.js')
  return { connectDatabase }
})

// 只 mock 外部系统：embedding 服务与向量库。本文件不 mock 任何自家模块——
// 整理用的 LLM 回合由调用方注入（见 memory-generation.test.ts）。
vi.mock('../services/ai/embedding-client.js', () => ({
  embedText: vi.fn(async () => [0.1, 0.2, 0.3])
}))
vi.mock('../services/vector/vector.service.js', () => ({
  upsertChunks: vi.fn(async () => ({ success: true, count: 1 })),
  searchChunks: vi.fn(async () => [])
}))

import { connectDatabase } from '../database/index.js'
import { getBuiltinToolMap } from '../services/ai/builtin-tools.js'
import { getMemoryDate, saveMemory } from '../services/wechat/memory.service.js'
import { saveWeChatUser } from '../services/wechat/users.service.js'

/** 工具返回文本（execute 的结果载荷） */
function resultText(res: unknown): string {
  return (res as { content: Array<{ text: string }> }).content.map(c => c.text).join('\n')
}

function memoryRows(): Array<{ user_id: string; content: string }> {
  return connectDatabase()
    .prepare('SELECT user_id, content FROM wechat_memories ORDER BY id')
    .all() as Array<{ user_id: string; content: string }>
}

beforeEach(() => {
  const db = connectDatabase()
  db.prepare('DELETE FROM wechat_memories').run()
  db.prepare('DELETE FROM settings').run()
})

describe('记忆工具的归属由服务端注入', () => {
  it('三个记忆工具的参数表里不再有 user_id', () => {
    const map = getBuiltinToolMap({ memoryUserId: 'u1' })
    for (const name of ['add_memory', 'search_memory', 'search_memory_vectors']) {
      const schema = map.get(name)!.parameters as { properties: Record<string, unknown> }
      expect(Object.keys(schema.properties)).not.toContain('user_id')
    }
  })

  it('add_memory 写入本回合对话的用户；参数里夹带的 user_id 被忽略', async () => {
    // 两个用户 → 排除「唯一用户回退」这条路，唯一来源就是回合上下文
    saveWeChatUser('u1')
    saveWeChatUser('u2')
    const tool = getBuiltinToolMap({ memoryUserId: 'u1' }).get('add_memory')!

    await tool.execute('call-1', { content: '用户喜欢美式', user_id: 'u2' })

    expect(memoryRows()).toEqual([{ user_id: 'u1', content: '用户喜欢美式' }])
  })

  it('没有回合上下文时回退到唯一用户（单用户部署仍然可用）', async () => {
    saveWeChatUser('u1')
    const tool = getBuiltinToolMap().get('add_memory')!

    await tool.execute('call-1', { content: '用户喜欢拿铁' })

    expect(memoryRows()).toEqual([{ user_id: 'u1', content: '用户喜欢拿铁' }])
  })

  it('既无上下文也无唯一用户时拒绝写入，不落到幽灵用户名下', async () => {
    saveWeChatUser('u1')
    saveWeChatUser('u2')
    const tool = getBuiltinToolMap().get('add_memory')!

    const text = resultText(await tool.execute('call-1', { content: '用户喜欢燕麦' }))

    expect(memoryRows()).toEqual([])
    expect(text).toContain('无法确定')
  })

  it('内容过短被拒——校验只在服务端一处，工具层不再自己抄一份', async () => {
    saveWeChatUser('u1')
    const tool = getBuiltinToolMap().get('add_memory')!

    const text = resultText(await tool.execute('call-1', { content: '好' }))

    expect(memoryRows()).toEqual([])
    expect(text).toContain('过短')
  })

  it('参数表里有类型与主题（供模型声明状态型/事件型）', () => {
    const schema = getBuiltinToolMap().get('add_memory')!.parameters as { properties: Record<string, unknown> }
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(['kind', 'topic']))
  })

  it('状态型：带主题写入，同主题新值取代旧值', async () => {
    saveWeChatUser('u1')
    const tool = getBuiltinToolMap({ memoryUserId: 'u1' }).get('add_memory')!

    await tool.execute('call-1', { content: '阅读进度 75%', kind: 'state', topic: '阅读进度:习惯的力量' })
    await tool.execute('call-2', { content: '阅读进度 85%', kind: 'state', topic: '阅读进度:习惯的力量' })

    const rows = connectDatabase()
      .prepare('SELECT content, kind, topic, archived_at FROM wechat_memories ORDER BY id')
      .all() as Array<{ content: string; kind: string; topic: string; archived_at: string | null }>
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ kind: 'state', topic: '阅读进度:习惯的力量', archived_at: expect.any(String) })
    expect(rows[1]).toMatchObject({ content: '阅读进度 85%', archived_at: null })
  })

  it('未知的类型值被忽略，不阻断写入', async () => {
    saveWeChatUser('u1')
    const tool = getBuiltinToolMap({ memoryUserId: 'u1' }).get('add_memory')!

    await tool.execute('call-1', { content: '用户睡前跑五公里', kind: '不知道什么型' })

    const row = connectDatabase().prepare('SELECT kind FROM wechat_memories').get() as { kind: string | null }
    expect(row.kind).toBeNull()
  })

  it('只有真的取代了旧值时才在答复里说取代（否则会误导模型以为主题键对上了）', async () => {
    saveWeChatUser('u1')
    const tool = getBuiltinToolMap({ memoryUserId: 'u1' }).get('add_memory')!

    const first = resultText(await tool.execute('call-1', {
      content: '阅读进度 75%', kind: 'state', topic: '阅读进度:习惯的力量'
    }))
    const second = resultText(await tool.execute('call-2', {
      content: '阅读进度 85%', kind: 'state', topic: '阅读进度:习惯的力量'
    }))

    expect(first).not.toContain('取代')
    expect(second).toContain('取代')
  })

  it('给未分类的历史记忆补类型：不新增行，答复说明这是补标注', async () => {
    saveWeChatUser('u1')
    connectDatabase().prepare(
      "INSERT INTO wechat_memories (user_id, content, memory_date) VALUES ('u1', '阅读进度 75%', '2026-10-01')"
    ).run()
    const tool = getBuiltinToolMap({ memoryUserId: 'u1' }).get('add_memory')!

    const text = resultText(await tool.execute('call-1', {
      content: '阅读进度 75%', kind: 'state', topic: '阅读进度:习惯的力量'
    }))

    const rows = connectDatabase().prepare('SELECT kind, topic FROM wechat_memories').all() as Array<{ kind: string; topic: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'state', topic: '阅读进度:习惯的力量' })
    expect(text).toContain('补上')
  })

  it('写入日期比同主题现有值更旧时，答复要说明它没成为当前状态', async () => {
    saveWeChatUser('u1')
    const tool = getBuiltinToolMap({ memoryUserId: 'u1' }).get('add_memory')!

    await tool.execute('call-1', {
      content: '阅读进度 85%', kind: 'state', topic: '阅读进度:习惯的力量', memory_date: '2026-10-11'
    })
    const text = resultText(await tool.execute('call-2', {
      content: '阅读进度 75%', kind: 'state', topic: '阅读进度:习惯的力量', memory_date: '2026-10-05'
    }))

    expect(text).toContain('未成为当前状态')
  })

  it('search_memory 只检索本回合用户，不跨用户', async () => {
    const today = getMemoryDate(new Date())
    saveMemory('u1', '用户喜欢美式咖啡', today)
    saveMemory('u2', '用户喜欢拿铁', today)

    const text = resultText(
      await getBuiltinToolMap({ memoryUserId: 'u1' }).get('search_memory')!.execute('call-1', { query: '喜欢' })
    )

    expect(text).toContain('美式咖啡')
    expect(text).not.toContain('拿铁')
  })

  it('search_memory_vectors 把本回合用户作为向量库过滤条件下发', async () => {
    const { searchChunks } = await import('../services/vector/vector.service.js')
    vi.mocked(searchChunks).mockResolvedValueOnce([])

    await getBuiltinToolMap({ memoryUserId: 'u1' })
      .get('search_memory_vectors')!
      .execute('call-1', { query: '咖啡' })

    expect(searchChunks).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Number),
      expect.objectContaining({
        filter: { must: [{ key: 'user_id', match: { value: 'u1' } }] }
      })
    )
  })
})
