import { WeChatBot } from '@wechatbot/wechatbot'
import { connectDatabase } from '../../database/index.js'

// 定时器
let reminderTimer: ReturnType<typeof setInterval> | null = null
let bot: WeChatBot | null = null

// 已提醒的任务 ID（避免重复提醒）
const remindedTodos = new Set<number>()

/**
 * 设置 Bot 实例
 */
export function setReminderBot(botInstance: WeChatBot): void {
  bot = botInstance
}

/**
 * 获取需要提醒的任务
 */
function getDueTodos(): Array<{ id: number; title: string; due_date: string; priority: string; reminder_time: string }> {
  const db = connectDatabase()
  const now = new Date()
  const currentTime = now.toISOString().replace('T', ' ').slice(0, 16) // YYYY-MM-DD HH:mm
  const today = now.toISOString().split('T')[0]

  const rows = db.prepare(`
    SELECT id, title, due_date, priority, reminder_time
    FROM todos
    WHERE is_deleted = 0
      AND status NOT IN ('done', 'cancelled')
      AND reminder_enabled = 1
      AND (
        (reminder_time IS NOT NULL AND reminder_time <= ?)
        OR
        (reminder_time IS NULL AND due_date IS NOT NULL AND due_date <= ?)
      )
    ORDER BY
      CASE WHEN reminder_time IS NOT NULL THEN reminder_time ELSE due_date END ASC,
      priority DESC
  `).all(currentTime, today) as Array<{ id: number; title: string; due_date: string; priority: string; reminder_time: string }>

  return rows
}

/**
 * 获取今天到期的任务
 */
function getTodayTodos(): Array<{ id: number; title: string; due_date: string; priority: string }> {
  const db = connectDatabase()
  const today = new Date().toISOString().split('T')[0]

  const rows = db.prepare(`
    SELECT id, title, due_date, priority
    FROM todos
    WHERE is_deleted = 0
      AND status NOT IN ('done', 'cancelled')
      AND due_date = ?
    ORDER BY priority DESC
  `).all(today) as Array<{ id: number; title: string; due_date: string; priority: string }>

  return rows
}

/**
 * 发送提醒消息
 */
async function sendReminder(userId: string, todos: Array<{ id: number; title: string; due_date: string; priority: string; reminder_time: string }>): Promise<void> {
  if (!bot || todos.length === 0) return

  const priorityEmoji: Record<string, string> = {
    urgent: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢'
  }

  const now = new Date()
  const today = now.toISOString().split('T')[0]

  const todoList = todos.map(t => {
    const emoji = priorityEmoji[t.priority] || '⚪'
    const isOverdue = t.due_date && t.due_date < today
    const reminderInfo = t.reminder_time ? `提醒: ${t.reminder_time}` : ''
    const dueInfo = t.due_date ? `截止: ${t.due_date}` : ''
    const status = isOverdue ? '⚠️ 已逾期' : '📅 待处理'
    const meta = [reminderInfo, dueInfo].filter(Boolean).join(' | ')
    return `${emoji} [${t.id}] ${t.title}\n   ${status} ${meta ? `(${meta})` : ''}`
  }).join('\n\n')

  const message = `⏰ 待办任务提醒\n\n${todoList}\n\n请及时处理！`

  try {
    await bot.send(userId, message)
    console.log(`[reminder] sent reminder to ${userId} for ${todos.length} todos`)
  } catch (err) {
    console.error(`[reminder] failed to send reminder to ${userId}:`, err)
  }
}

/**
 * 获取所有微信用户 ID
 */
function getWeChatUsers(): string[] {
  const db = connectDatabase()
  // 从 ilink_bot_status 中获取用户列表
  // 这里简化为从消息历史中获取
  const rows = db.prepare(`
    SELECT DISTINCT key as userId
    FROM settings
    WHERE key LIKE 'ilink_user_%'
    LIMIT 10
  `).all() as Array<{ userId: string }>

  return rows.map(r => r.userId.replace('ilink_user_', ''))
}

/**
 * 检查并发送提醒
 */
async function checkAndRemind(): Promise<void> {
  try {
    // 获取到期的任务
    const dueTodos = getDueTodos()

    // 过滤已提醒的任务
    const newTodos = dueTodos.filter(t => !remindedTodos.has(t.id))

    if (newTodos.length === 0) {
      return
    }

    console.log(`[reminder] found ${newTodos.length} due todos`)

    // 获取所有用户
    const users = getWeChatUsers()

    if (users.length === 0) {
      console.log('[reminder] no users found, skipping')
      return
    }

    // 发送提醒给每个用户
    for (const userId of users) {
      await sendReminder(userId, newTodos)
    }

    // 标记已提醒
    newTodos.forEach(t => remindedTodos.add(t.id))
  } catch (err) {
    console.error('[reminder] check failed:', err)
  }
}

/**
 * 启动定时提醒服务
 */
export function startReminderService(intervalMinutes: number = 60): void {
  if (reminderTimer) {
    console.log('[reminder] service already running')
    return
  }

  console.log(`[reminder] starting reminder service (interval: ${intervalMinutes}min)`)

  // 立即检查一次
  checkAndRemind()

  // 设置定时器
  reminderTimer = setInterval(checkAndRemind, intervalMinutes * 60 * 1000)
}

/**
 * 停止定时提醒服务
 */
export function stopReminderService(): void {
  if (reminderTimer) {
    clearInterval(reminderTimer)
    reminderTimer = null
    console.log('[reminder] service stopped')
  }
}

/**
 * 手动触发提醒检查
 */
export async function triggerReminder(): Promise<{ success: boolean; count: number }> {
  try {
    const dueTodos = getDueTodos()
    const newTodos = dueTodos.filter(t => !remindedTodos.has(t.id))

    if (newTodos.length === 0) {
      return { success: true, count: 0 }
    }

    // 获取用户
    const users = getWeChatUsers()

    if (users.length === 0) {
      return { success: true, count: 0 }
    }

    // 发送提醒
    for (const userId of users) {
      await sendReminder(userId, newTodos)
    }

    // 标记已提醒
    newTodos.forEach(t => remindedTodos.add(t.id))

    return { success: true, count: newTodos.length }
  } catch (err) {
    console.error('[reminder] trigger failed:', err)
    return { success: false, count: 0 }
  }
}

/**
 * 获取提醒状态
 */
export function getReminderStatus(): {
  running: boolean
  remindedCount: number
  dueTodos: Array<{ id: number; title: string; due_date: string; priority: string; reminder_time: string }>
} {
  return {
    running: reminderTimer !== null,
    remindedCount: remindedTodos.size,
    dueTodos: getDueTodos()
  }
}

/**
 * 清除已提醒记录（用于测试）
 */
export function clearRemindedTodos(): void {
  remindedTodos.clear()
}

/**
 * 保存微信用户 ID
 */
export function saveWeChatUser(userId: string): void {
  const db = connectDatabase()
  db.prepare(`
    INSERT OR REPLACE INTO settings (key, value, updated_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `).run(`ilink_user_${userId}`, '1')
}
