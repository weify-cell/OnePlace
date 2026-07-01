import { Request, Response } from 'express'
import * as ilinkBot from '../services/wechat/ilink-bot.service.js'
import * as reminderService from '../services/wechat/todo-reminder.service.js'
import * as proactiveChat from '../services/wechat/proactive-chat.service.js'
import * as settingsService from '../services/settings.service.js'

function getSingleParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

/**
 * 获取 Bot 状态
 */
export function getStatus(req: Request, res: Response): void {
  const status = ilinkBot.getILinkBotStatus()
  const config = ilinkBot.getILinkConfig()
  res.json({
    ...status,
    learning_modes: Object.fromEntries(
      // 返回所有在学习模式的用户（通过 history API 的用户列表推断）
      // 这里简化处理，通过请求参数 userId 查询
      []
    ),
    config: {
      enabled: config.enabled,
      provider: config.provider,
      model: config.model
    }
  })
}

/**
 * 查询用户学习模式状态
 */
export function getLearningModeStatus(req: Request, res: Response): void {
  const userId = req.query.userId as string
  if (!userId) {
    res.status(400).json({ error: 'userId is required' })
    return
  }
  const mode = ilinkBot.getUserLearningMode(userId)
  res.json({
    userId,
    mode: mode?.mode || 'normal',
    learningTopic: mode?.learningTopic || null
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
    max_tool_rounds: config.max_tool_rounds,
    proactive_system_prompt: settingsService.getSettingValue<string>('ilink_proactive_chat_system_prompt', ''),
    proactive_user_message: settingsService.getSettingValue<string>('ilink_proactive_chat_user_message', '请生成一条主动问候消息'),
    learning_prompt: settingsService.getSettingValue<string>('ilink_learning_prompt', '你是一个学习导师，正在帮助用户学习「{topic}」。请按以下方式教学：1. 先使用 search_knowledge_base 和 get_note 工具检索用户的笔记资料 2. 以问答方式测试用户对知识点的掌握 3. 根据用户的回答给予反馈和补充解释 4. 控制每次提问1-2个问题，不要连续轰炸 5. 用户答对时鼓励，答错时耐心纠正 6. 如果笔记中没有相关内容，诚实告知并给出通用知识')
  })
}

/**
 * 更新 Bot 配置
 */
export function updateConfig(req: Request, res: Response): void {
  const { enabled, provider, model, system_prompt, max_tool_rounds, reminder_interval, proactive_user_message, proactive_system_prompt, learning_prompt } = req.body

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
  if (proactive_user_message !== undefined) {
    settingsService.setSetting('ilink_proactive_chat_user_message', proactive_user_message)
  }
  if (proactive_system_prompt !== undefined) {
    settingsService.setSetting('ilink_proactive_chat_system_prompt', proactive_system_prompt)
  }
  if (learning_prompt !== undefined) {
    settingsService.setSetting('ilink_learning_prompt', learning_prompt)
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
  const userId = getSingleParam(req.params.userId)
  if (!userId) {
    res.status(400).json({ error: 'BadRequest', message: 'userId is required' })
    return
  }
  const history = ilinkBot.getMessageHistory(userId)
  res.json(history)
}

/**
 * 清除消息历史
 */
export function clearMessageHistory(req: Request, res: Response): void {
  const userId = getSingleParam(req.params.userId)
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
    check_interval: status.config.checkInterval,
    system_prompt: settingsService.getSettingValue<string>('ilink_proactive_chat_system_prompt', ''),
    user_message: settingsService.getSettingValue<string>('ilink_proactive_chat_user_message', '请生成一条主动问候消息')
  })
}

/**
 * 更新主动聊天配置
 */
export function updateProactiveChatConfig(req: Request, res: Response): void {
  const { enabled, min_interval, quiet_hours_start, quiet_hours_end, check_interval, system_prompt, user_message } = req.body

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
  if (system_prompt !== undefined) {
    settingsService.setSetting('ilink_proactive_chat_system_prompt', system_prompt)
  }
  if (user_message !== undefined) {
    settingsService.setSetting('ilink_proactive_chat_user_message', user_message)
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
