import { describe, expect, it, vi } from 'vitest'

vi.mock('../database/index.js', async () => {
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE wechat_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      memory_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, content)
    );
    CREATE TABLE wechat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `)
  return { connectDatabase: () => db }
})

import { connectDatabase } from '../database/index.js'
import {
  isMemoryDue, getMemoryDate, saveMemory, queryMemories,
  searchMemories, parseMemoryItems, buildMemoryPrompt
} from '../services/wechat/memory.service.js'

describe('isMemoryDue', () => {
  const DUE_830 = new Date('2026-08-01T16:30:00.000Z')   // 北京 8-02 00:30
  const DUE_831 = new Date('2026-08-01T16:31:00.000Z')   // 北京 8-02 00:31（容忍）
  const OFF_832 = new Date('2026-08-01T16:32:00.000Z')   // 北京 8-02 00:32
  const OFF_800 = new Date('2026-08-01T16:00:00.000Z')   // 北京 8-02 00:00
  const OFF_100 = new Date('2026-08-01T17:00:00.000Z')   // 北京 8-02 01:00

  it('北京 00:30 到点，00:31 容忍，00:32 不再触发', () => {
    expect(isMemoryDue(DUE_830)).toBe(true)
    expect(isMemoryDue(DUE_831)).toBe(true)
    expect(isMemoryDue(OFF_832)).toBe(false)
    expect(isMemoryDue(OFF_800)).toBe(false)
    expect(isMemoryDue(OFF_100)).toBe(false)
  })
})

describe('getMemoryDate', () => {
  it('返回北京 YYYY-MM-DD', () => {
    expect(getMemoryDate(new Date('2026-08-01T16:30:00.000Z'))).toBe('2026-08-02') // 北京 00:30
    expect(getMemoryDate(new Date('2026-07-31T16:00:00.000Z'))).toBe('2026-08-01') // 北京 00:00
    expect(getMemoryDate(new Date('2026-08-02T14:00:00.000Z'))).toBe('2026-08-02') // 北京 22:00
  })
})

describe('saveMemory', () => {
  it('落表返回新 id；(user, content) 去重返回 0', () => {
    const db = connectDatabase()
    const id1 = saveMemory('u1', '用户喝美式', '2026-08-01')
    const id2 = saveMemory('u1', '用户喝美式', '2026-08-02') // 同内容 → 去重
    const id3 = saveMemory('u1', '项目A在开发', '2026-08-01')
    expect(id1).toBeGreaterThan(0)
    expect(id2).toBe(0)
    expect(id3).toBeGreaterThan(0)
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_memories').get()).toMatchObject({ c: 2 })
  })
})

describe('queryMemories', () => {
  it('近 N 天过滤 + 用户隔离', () => {
    const now = new Date()
    saveMemory('u1', '三十天前的事', getMemoryDate(new Date(now.getTime() - 30 * 86400000)))
    saveMemory('u1', '最近的事', getMemoryDate(now))
    saveMemory('u2', '别人的事', getMemoryDate(now))
    const rows = queryMemories('u1', { days: 30 })
    expect(rows.map(r => r.content)).toContain('最近的事')
    expect(rows.map(r => r.content)).not.toContain('三十天前的事')
    expect(rows.every(r => r.user_id === 'u1')).toBe(true)
  })
})

describe('searchMemories', () => {
  it('关键词 + 用户过滤', () => {
    const today = getMemoryDate(new Date())
    saveMemory('u1', '用户喝美式咖啡', today)
    saveMemory('u1', '项目A进入测试阶段', today)
    saveMemory('u2', '用户喝拿铁', today)
    const rows = searchMemories('美式', { userId: 'u1' })
    expect(rows.map(r => r.content)).toContain('用户喝美式咖啡')
    expect(rows.map(r => r.content)).not.toContain('用户喝拿铁')
    expect(searchMemories('美式')).toHaveLength(2)
  })
})

describe('parseMemoryItems', () => {
  it('兼容 - / * / 数字 / 普通行，过滤空行/过短/标题/无', () => {
    const out = parseMemoryItems('- 用户喝美式\n* 项目A在开发\n1. 用户周日常跑步\n普通行也算\n\n   \n无\n## 标题\n# 另一个标题')
    expect(out).toEqual(['用户喝美式', '项目A在开发', '用户周日常跑步', '普通行也算'])
  })
})

describe('buildMemoryPrompt', () => {
  it('近30天附记包含记忆与用户ID；无记忆返回空串', () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM wechat_memories').run()
    saveMemory('u1', '用户喝美式', getMemoryDate(new Date()))
    const p = buildMemoryPrompt('u1')
    expect(p).toContain('## 记忆（近30天）')
    expect(p).toContain('当前用户微信ID：u1')
    expect(p).toContain('用户喝美式')
    expect(buildMemoryPrompt('u2')).toBe('')
  })
})
