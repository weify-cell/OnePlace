import { describe, expect, it, vi } from 'vitest'

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

import { getWeChatUsers, getUserLastActiveTime, saveWeChatUser } from '../services/wechat/users.service.js'
import { connectDatabase } from '../database/index.js'

describe('saveWeChatUser / getWeChatUsers', () => {
  it('注册后可被枚举，且不暴露键前缀', () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM settings').run()

    saveWeChatUser('wxid_alice')
    expect(getWeChatUsers()).toEqual(['wxid_alice'])

    // 寄存形式仍然是 settings 表里的 ilink_user_ 键
    expect(db.prepare('SELECT key FROM settings').get()).toMatchObject({ key: 'ilink_user_wxid_alice' })
  })

  it('重复注册只刷新 updated_at，不产生重复行', () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM settings').run()
    db.prepare("INSERT INTO settings (key, value, description, updated_at) VALUES ('ilink_user_u1', '1', '保留我', '2020-01-01T00:00:00.000Z')").run()

    saveWeChatUser('u1')

    expect(db.prepare("SELECT COUNT(*) c FROM settings WHERE key = 'ilink_user_u1'").get()).toMatchObject({ c: 1 })
    // description 列不被重置（避免 INSERT OR REPLACE 的副作用）
    expect(db.prepare("SELECT description FROM settings WHERE key = 'ilink_user_u1'").get()).toMatchObject({ description: '保留我' })
  })

  it('枚举被限制在上限内（不受 settings 表其他键影响）', () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM settings').run()
    for (let i = 0; i < 15; i++) saveWeChatUser(`u${i}`)
    db.prepare("INSERT INTO settings (key, value) VALUES ('default_model', '\"x\"')").run()

    const users = getWeChatUsers()
    expect(users).toHaveLength(10)
    expect(users.every(u => /^u\d+$/.test(u))).toBe(true)
  })
})

describe('getUserLastActiveTime', () => {
  it('返回注册（即最后发言）时间；未注册返回 null', () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM settings').run()

    expect(getUserLastActiveTime('nobody')).toBeNull()

    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('ilink_user_u9', '1', '2026-09-10T15:30:00.000Z')").run()
    expect(getUserLastActiveTime('u9')).toBe(new Date('2026-09-10T15:30:00.000Z').getTime())
  })
})
