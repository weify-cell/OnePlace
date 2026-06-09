import { Request, Response } from 'express'
import * as ilinkBot from '../services/wechat/ilink-bot.service.js'
import * as reminderService from '../services/wechat/todo-reminder.service.js'
import * as proactiveChat from '../services/wechat/proactive-chat.service.js'
import * as settingsService from '../services/settings.service.js'

/**
 * 获取 Bot 状态
 */
export function getStatus(req: Request, res: Response): void {
  const status = ilinkBot.getILinkBotStatus()
  const config = ilinkBot.getILinkConfig()
  res.json({
    ...status,
    config: {
      enabled: config.enabled,
      provider: config.provider,
      model: config.model
    }
  })
}

/**
 * 获取 Bot 配置
 */
export function getConfig(req: Request, res: Response): void {
  const config = ilinkBot.getILinkConfig()
  res.json({
    enabled: config.enabled,
    provider: config.provider,
    model: config.model,
    system_prompt: config.system_prompt,
    max_tool_rounds: config.max_tool_rounds
  })
}

/**
 * 更新 Bot 配置
 */
export function updateConfig(req: Request, res: Response): void {
  const { enabled, provider, model, system_prompt, max_tool_rounds, reminder_interval } = req.body

  if (enabled !== undefined) {
    settingsService.setSetting('ilink_enabled', enabled)
  }
  if (provider !== undefined) {
    settingsService.setSetting('ilink_provider', provider)
  }
  if (model !== undefined) {
    settingsService.setSetting('ilink_model', model)
  }
  if (system_prompt !== undefined) {
    settingsService.setSetting('ilink_system_prompt', system_prompt)
  }
  if (max_tool_rounds !== undefined) {
    settingsService.setSetting('ilink_max_tool_rounds', max_tool_rounds)
  }
  if (reminder_interval !== undefined) {
    settingsService.setSetting('ilink_reminder_interval', reminder_interval)
  }

  res.json({ success: true })
}

/**
 * 启动 Bot
 */
export async function startBot(req: Request, res: Response): Promise<void> {
  const result = await ilinkBot.startILinkBot()
  if (result.success) {
    res.json({ success: true, status: ilinkBot.getILinkBotStatus() })
  } else {
    res.status(400).json({ success: false, error: result.error })
  }
}

/**
 * 停止 Bot
 */
export function stopBot(req: Request, res: Response): void {
  const result = ilinkBot.stopILinkBot()
  if (result.success) {
    res.json({ success: true, status: ilinkBot.getILinkBotStatus() })
  } else {
    res.status(400).json({ success: false, error: result.error })
  }
}

/**
 * 获取登录状态
 */
export function getLoginStatus(req: Request, res: Response): void {
  const status = ilinkBot.getLoginStatus()
  res.json(status)
}

/**
 * 重置登录状态
 */
export function resetLogin(req: Request, res: Response): void {
  ilinkBot.resetLoginState()
  res.json({ success: true })
}

/**
 * 获取消息历史（调试用）
 */
export function getMessageHistory(req: Request, res: Response): void {
  const { userId } = req.params
  const history = ilinkBot.getMessageHistory(userId)
  res.json(history)
}

/**
 * 清除消息历史
 */
export function clearMessageHistory(req: Request, res: Response): void {
  const { userId } = req.params
  ilinkBot.clearMessageHistory(userId)
  res.json({ success: true })
}

/**
 * 获取提醒状态
 */
export function getReminderStatus(req: Request, res: Response): void {
  const status = reminderService.getReminderStatus()
  res.json(status)
}

/**
 * 手动触发提醒
 */
export async function triggerReminder(req: Request, res: Response): Promise<void> {
  const result = await reminderService.triggerReminder()
  res.json(result)
}

/**
 * 清除已提醒记录
 */
export function clearRemindedTodos(req: Request, res: Response): void {
  reminderService.clearRemindedTodos()
  res.json({ success: true })
}

/**
 * 获取主动聊天配置
 */
export function getProactiveChatConfig(req: Request, res: Response): void {
  const status = proactiveChat.getProactiveChatStatus()
  res.json({
    enabled: status.config.enabled,
    min_interval: status.config.minInterval,
    quiet_hours_start: status.config.quietHoursStart,
    quiet_hours_end: status.config.quietHoursEnd,
    check_interval: status.config.checkInterval
  })
}

/**
 * 更新主动聊天配置
 */
export function updateProactiveChatConfig(req: Request, res: Response): void {
  const { enabled, min_interval, quiet_hours_start, quiet_hours_end, check_interval } = req.body

  if (enabled !== undefined) {
    settingsService.setSetting('ilink_proactive_chat_enabled', enabled)
  }
  if (min_interval !== undefined) {
    settingsService.setSetting('ilink_proactive_chat_min_interval', min_interval)
  }
  if (quiet_hours_start !== undefined) {
    settingsService.setSetting('ilink_proactive_chat_quiet_hours_start', quiet_hours_start)
  }
  if (quiet_hours_end !== undefined) {
    settingsService.setSetting('ilink_proactive_chat_quiet_hours_end', quiet_hours_end)
  }
  if (check_interval !== undefined) {
    settingsService.setSetting('ilink_proactive_chat_check_interval', check_interval)
  }

  // 通知服务配置已更新
  proactiveChat.updateProactiveChatConfig({
    enabled,
    minInterval: min_interval,
    quietHoursStart: quiet_hours_start,
    quietHoursEnd: quiet_hours_end,
    checkInterval: check_interval
  })

  res.json({ success: true })
}
