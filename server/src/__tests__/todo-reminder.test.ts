import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 提醒的「可观察后果」seam：提醒发出去之后，主对话知不知道它说过这句话。
 *
 * 只 mock 系统边界：外部微信 SDK（共用替身）+ 数据库连接（真库、真迁移）。
 * delivery 不是 mock，而是给它注入替身 bot——那才是被替换的那条边界。
 */
vi.mock('@wechatbot/wechatbot', async () => await import('./helpers/fake-wechat-sdk.js'))
vi.mock('../database/index.js', async () => await import('./helpers/test-db.js'))

import { connectDatabase } from '../database/index.js'
import { WeChatBot, resetInstances } from './helpers/fake-wechat-sdk.js'
import { setDeliveryBot } from '../services/wechat/delivery.js'
import { saveWeChatUser } from '../services/wechat/users.service.js'
import { triggerReminder } from '../services/wechat/todo-reminder.service.js'

const USER = 'o9cq80-test-user'

/** 造一条「到点该提醒」的待办：reminder_time 用过去的北京时间字符串 */
function seedDueTodo(title: string, reminderTime = '2026-01-01 09:00'): number {
  const res = connectDatabase().prepare(`
    INSERT INTO todos (title, priority, status, reminder_enabled, reminder_time, is_deleted)
    VALUES (?, 'medium', 'todo', 1, ?, 0)
  `).run(title, reminderTime)
  return Number(res.lastInsertRowid)
}

function chatHistory(): Array<{ role: string; content: string }> {
  return connectDatabase()
    .prepare('SELECT role, content FROM wechat_messages ORDER BY id')
    .all() as Array<{ role: string; content: string }>
}

beforeEach(() => {
  const db = connectDatabase()
  db.prepare('DELETE FROM todos').run()
  db.prepare('DELETE FROM wechat_messages').run()
  db.prepare('DELETE FROM settings').run()
  resetInstances()
  setDeliveryBot(new WeChatBot() as never)
  saveWeChatUser(USER)
})

describe('待办提醒与对话历史', () => {
  it('提醒送达后写进聊天历史，且只写 assistant 一条', async () => {
    seedDueTodo('给车位续费')

    const res = await triggerReminder()
    expect(res.success).toBe(true)

    const rows = chatHistory()
    expect(rows).toHaveLength(1)
    expect(rows[0].role).toBe('assistant')
    expect(rows[0].content).toContain('待办任务提醒')
    expect(rows[0].content).toContain('给车位续费')
  })

  it('不补写合成的 user 行——那类行会被每晚整理当成「用户说过的话」抽成噪声记忆', async () => {
    seedDueTodo('给车位续费')

    await triggerReminder()

    expect(chatHistory().filter(r => r.role === 'user')).toEqual([])
  })

  it('没有到点的待办时不写历史', async () => {
    seedDueTodo('还没到点', '2099-01-01 09:00')

    await triggerReminder()

    expect(chatHistory()).toEqual([])
  })
})
