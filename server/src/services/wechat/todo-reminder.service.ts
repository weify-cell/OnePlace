import { connectDatabase } from '../../database/index.js'
import { getSettingValue } from '../settings.service.js'
import { getBeijingDate, getBeijingDateTime, getBeijingDateAfter } from '../../utils/time.js'
import { getWeChatUsers } from './users.service.js'
import { isJobRunning, type SubsystemJob } from './scheduler.js'
import { isDeliveryReady, sendToUser } from './delivery.js'

/**
 * 提醒子系统作业描述。
 * 间隔取自设置 `ilink_reminder_interval`（每次启动/重建时读取）；
 * 不设首次延迟——启动即检查一次（保持原语义）。
 * 不再持有 bot：发送与积压由 delivery 模块负责。
 */
export const reminderJob: SubsystemJob = {
  name: 'reminder',
  run: checkAndRemind,
  intervalMinutes: () => getSettingValue<number>('ilink_reminder_interval', 60),
}

/**
 * 获取需要提醒的任务
 */
function getDueTodos(): Array<{ id: number; title: string; due_date: string; priority: string; reminder_time: string; task_kind: string }> {
  const db = connectDatabase()

  // 统一使用北京时间比较（reminder_time 亦为北京时间字符串，可直接字符串比较）
  const currentTime = getBeijingDateTime() // YYYY-MM-DD HH:mm
  const today = getBeijingDate() // YYYY-MM-DD

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
  const today = getBeijingDate()

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
 * 发送提醒消息；返回本次是否真的送达（token 过期入队时算未送达）。
 */
async function sendReminder(userId: string, todos: Array<{ id: number; title: string; due_date: string; priority: string; reminder_time: string }>): Promise<boolean> {
  if (!isDeliveryReady() || todos.length === 0) return false

  const priorityEmoji: Record<string, string> = {
    urgent: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢'
  }

  const today = getBeijingDate()

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

  // 投递策略（token 过期→入队补发、并发去重）统一由 delivery 模块负责
  return sendToUser(userId, message)
}

/**
 * 将 reminder_time 推迟一天（保持相同的 HH:mm）。入参格式 "2026-07-08 14:30" → "2026-07-09 14:30"。
 * 新日期取「北京今天 + 1 天」（而非原日期 +1）：长期任务积压多天时也只跳一次到明天，不会连环补发。
 */
function advanceReminderByOneDay(reminderTime: string): string {
  const timePart = reminderTime.split(' ')[1]
  if (!timePart) return reminderTime
  return `${getBeijingDateAfter(1)} ${timePart}`
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
        if (await sendReminder(userId, dueTodos)) successCount++
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
    running: isJobRunning(reminderJob.name),
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
