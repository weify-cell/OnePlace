import { WeChatBot } from '@wechatbot/wechatbot'
import { connectDatabase } from '../../database/index.js'

// 定时器
let reminderTimer: ReturnType<typeof setInterval> | null = null
let bot: WeChatBot | null = null


// 待发送提醒队列（context_token 过期时暂存）
const pendingReminders = new Map<string, Array<{ message: string; timestamp: number }>>()

/**
 * 设置 Bot 实例
 */
export function setReminderBot(botInstance: WeChatBot): void {
  bot = botInstance
}

/**
 * 获取北京时间字符串
 */
function getBeijingTime(): string {
  const now = new Date()
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }
  const formatter = new Intl.DateTimeFormat('zh-CN', options)
  const parts = formatter.formatToParts(now)
  const year = parts.find(p => p.type === 'year')?.value || ''
  const month = parts.find(p => p.type === 'month')?.value || ''
  const day = parts.find(p => p.type === 'day')?.value || ''
  const hour = parts.find(p => p.type === 'hour')?.value || ''
  const minute = parts.find(p => p.type === 'minute')?.value || ''
  const second = parts.find(p => p.type === 'second')?.value || ''
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

/**
 * 获取需要提醒的任务
 */
function getDueTodos(): Array<{ id: number; title: string; due_date: string; priority: string; reminder_time: string; task_kind: string }> {
  const db = connectDatabase()
  const now = new Date()

  // 使用北京时间进行比较
  const currentTime = getBeijingTime().slice(0, 16) // YYYY-MM-DD HH:mm
  const today = getBeijingTime().slice(0, 10) // YYYY-MM-DD

  console.log(`[reminder] checking with Beijing time: ${currentTime}, today: ${today}`)

  const rows = db.prepare(`
    SELECT id, title, due_date, priority, reminder_time, task_kind
    FROM todos
    WHERE is_deleted = 0
      AND status NOT IN ('done', 'cancelled')
      AND reminder_enabled = 1
      AND reminder_time IS NOT NULL
      AND reminder_time <= ?
    ORDER BY reminder_time ASC, priority DESC
  `).all(currentTime) as Array<{ id: number; title: string; due_date: string; priority: string; reminder_time: string; task_kind: string }>

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
  } catch (err: any) {
    console.error(`[reminder] failed to send reminder to ${userId}:`, err.message || err)

    // 如果是 context_token 过期 (ret=-2)，保存到待发送队列
    if (err.code === 'API_ERROR' && err.payload?.ret === -2) {
      console.log(`[reminder] context_token expired for ${userId}, saving to pending queue`)

      // 保存到待发送队列
      const pending = pendingReminders.get(userId) || []
      pending.push({ message, timestamp: Date.now() })
      pendingReminders.set(userId, pending)

      // 清除存储中的 context_token
      try {
        const fs = await import('node:fs/promises')
        const path = await import('node:path')
        const os = await import('node:os')
        const tokenFile = path.join(os.homedir(), '.wechatbot', 'context_tokens.json')
        const raw = await fs.readFile(tokenFile, 'utf8').catch(() => '{}')
        const tokens = JSON.parse(raw)
        delete tokens[userId]
        await fs.writeFile(tokenFile, JSON.stringify(tokens, null, 2) + '\n')
      } catch (clearErr) {
        console.error('[reminder] failed to clear context_token:', clearErr)
      }
    }

    throw err // 重新抛出异常，让调用者知道发送失败
  }
}

/**
 * 发送积压的提醒（用户重新发消息后调用）
 */
export async function sendPendingReminders(userId: string): Promise<void> {
  const pending = pendingReminders.get(userId)
  if (!pending || pending.length === 0 || !bot) return

  console.log(`[reminder] sending ${pending.length} pending reminders to ${userId}`)

  // 合并所有积压的提醒为一条消息
  const messages = pending.map(p => p.message)
  const combinedMessage = messages.join('\n\n---\n\n')

  try {
    await bot.send(userId, combinedMessage)
    console.log(`[reminder] sent ${pending.length} pending reminders to ${userId}`)
    // 清除队列
    pendingReminders.delete(userId)
  } catch (err) {
    console.error(`[reminder] failed to send pending reminders to ${userId}:`, err)
    // 如果还是失败，保留队列等待下次重试
  }
}

/**
 * 检查是否有待发送的提醒
 */
export function hasPendingReminders(userId: string): boolean {
  const pending = pendingReminders.get(userId)
  return pending !== undefined && pending.length > 0
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
 * 将 reminder_time 推迟一天（保持相同的 HH:mm）。
 * 入参格式："2026-07-08 14:30"，返回 "2026-07-09 14:30"。
 */
function advanceReminderByOneDay(reminderTime: string): string {
  // 解析 "YYYY-MM-DD HH:mm" 格式
  const [datePart, timePart] = reminderTime.split(' ')
  if (!datePart || !timePart) return reminderTime

  // 用北京时间计算明天
  const now = new Date()
  const beijingFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = beijingFormatter.formatToParts(now)
  const year = parts.find(p => p.type === 'year')?.value || ''
  const month = parts.find(p => p.type === 'month')?.value || ''
  const day = parts.find(p => p.type === 'day')?.value || ''

  // 今天 + 1 天
  const tomorrow = new Date(Number(year), Number(month) - 1, Number(day) + 1)
  const tYear = tomorrow.getFullYear()
  const tMonth = String(tomorrow.getMonth() + 1).padStart(2, '0')
  const tDay = String(tomorrow.getDate()).padStart(2, '0')

  return `${tYear}-${tMonth}-${tDay} ${timePart}`
}

/**
 * 检查并发送提醒，长期任务自动将提醒时间推迟到明天。
 */
async function checkAndRemind(): Promise<void> {
  try {
    const dueTodos = getDueTodos()

    if (dueTodos.length === 0) {
      return
    }

    console.log(`[reminder] found ${dueTodos.length} due todos`)

    const users = getWeChatUsers()

    if (users.length === 0) {
      console.log('[reminder] no users found, skipping')
      return
    }

    let successCount = 0
    for (const userId of users) {
      try {
        await sendReminder(userId, dueTodos)
        successCount++
      } catch (err) {
        console.error(`[reminder] failed to send to ${userId}:`, err)
      }
    }

    if (successCount === 0) {
      console.log('[reminder] no reminders sent successfully, will retry next cycle')
      return
    }

    const db = connectDatabase()

    // 长期任务：reminder_time 推迟一天，明天继续提醒
    const longTermTodos = dueTodos.filter(t => t.task_kind === 'long_term')
    if (longTermTodos.length > 0) {
      const advanceStmt = db.prepare('UPDATE todos SET reminder_time = ? WHERE id = ?')
      for (const t of longTermTodos) {
        const nextTime = advanceReminderByOneDay(t.reminder_time)
        advanceStmt.run(nextTime, t.id)
        console.log(`[reminder] advanced long-term todo #${t.id} "${t.title}" reminder: ${t.reminder_time} → ${nextTime}`)
      }
    }

    // 短期任务：关闭提醒开关，持久化防止重启后重复提醒
    const shortTermTodos = dueTodos.filter(t => t.task_kind !== 'long_term')
    if (shortTermTodos.length > 0) {
      const disableStmt = db.prepare('UPDATE todos SET reminder_enabled = 0 WHERE id = ?')
      for (const t of shortTermTodos) {
        disableStmt.run(t.id)
        console.log(`[reminder] disabled short-term todo #${t.id} "${t.title}" reminder`)
      }
    }

    console.log(`[reminder] done: ${longTermTodos.length} long-term (auto-advanced), ${shortTermTodos.length} short-term (disabled)`)
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

    if (dueTodos.length === 0) {
      return { success: true, count: 0 }
    }

    const users = getWeChatUsers()

    if (users.length === 0) {
      return { success: true, count: 0 }
    }

    for (const userId of users) {
      await sendReminder(userId, dueTodos)
    }

    const db = connectDatabase()

    // 长期任务：推迟到明天
    const longTermTodos = dueTodos.filter(t => t.task_kind === 'long_term')
    if (longTermTodos.length > 0) {
      const advanceStmt = db.prepare('UPDATE todos SET reminder_time = ? WHERE id = ?')
      for (const t of longTermTodos) {
        advanceStmt.run(advanceReminderByOneDay(t.reminder_time), t.id)
      }
    }

    // 短期任务：关闭提醒
    const shortTermTodos = dueTodos.filter(t => t.task_kind !== 'long_term')
    if (shortTermTodos.length > 0) {
      const disableStmt = db.prepare('UPDATE todos SET reminder_enabled = 0 WHERE id = ?')
      for (const t of shortTermTodos) {
        disableStmt.run(t.id)
      }
    }

    return { success: true, count: dueTodos.length }
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
  activeReminders: number
  dueTodos: Array<{ id: number; title: string; due_date: string; priority: string; reminder_time: string; task_kind: string }>
} {
  const db = connectDatabase()
  const countRow = db.prepare(
    "SELECT COUNT(*) as c FROM todos WHERE is_deleted = 0 AND status NOT IN ('done','cancelled') AND reminder_enabled = 1 AND reminder_time IS NOT NULL"
  ).get() as { c: number }
  return {
    running: reminderTimer !== null,
    activeReminders: countRow.c,
    dueTodos: getDueTodos()
  }
}

/**
 * 重置所有已提醒的短期任务（将 reminder_enabled 恢复为 1），用于测试。
 */
export function clearRemindedTodos(): void {
  const db = connectDatabase()
  db.prepare(
    "UPDATE todos SET reminder_enabled = 1 WHERE is_deleted = 0 AND status NOT IN ('done','cancelled') AND task_kind != 'long_term' AND reminder_time IS NOT NULL AND reminder_enabled = 0"
  ).run()
}

/**
 * 保存微信用户 ID（保留既有 description 列，避免 INSERT OR REPLACE 重置）
 */
export function saveWeChatUser(userId: string): void {
  const db = connectDatabase()
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(`ilink_user_${userId}`, '1')
}
