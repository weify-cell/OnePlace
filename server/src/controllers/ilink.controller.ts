import { Request, Response } from 'express'
import * as ilinkBot from '../services/wechat/ilink-bot.service.js'
import * as reminderService from '../services/wechat/todo-reminder.service.js'
import * as proactiveChat from '../services/wechat/proactive-chat.service.js'
import * as reportService from '../services/wechat/report.service.js'
import * as settingsService from '../services/settings.service.js'
import {
  DEFAULT_ILINK_LEARNING_PROMPT,
  DEFAULT_NOTE_TOOLS_PROMPT,
  DEFAULT_PROACTIVE_SYSTEM_PROMPT,
  DEFAULT_PROACTIVE_USER_MESSAGE
} from '../services/prompt-defaults.js'

function getSingleParam(value: string | string[] | object | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  if (typeof value === 'object' && value !== null) return undefined
  return value
}

export function getStatus(req: Request, res: Response): void {
  const status = ilinkBot.getILinkBotStatus()
  const config = ilinkBot.getILinkConfig()
  res.json({
    ...status,
    learning_modes: Object.fromEntries([]),
    config: {
      enabled: config.enabled,
      provider: config.provider,
      model: config.model
    }
  })
}

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

export function getConfig(req: Request, res: Response): void {
  const config = ilinkBot.getILinkConfig()
  const noteToolsPrompt = settingsService.getSettingValue<string>(
    'note_tools_prompt',
    settingsService.getSettingValue<string>('ilink_tool_usage_prompt', DEFAULT_NOTE_TOOLS_PROMPT)
  )

  res.json({
    enabled: config.enabled,
    provider: config.provider,
    model: config.model,
    system_prompt: config.system_prompt,
    note_tools_prompt: noteToolsPrompt,
    max_tool_rounds: config.max_tool_rounds,
    proactive_enabled: settingsService.getSettingValue<boolean>('ilink_proactive_chat_enabled', true),
    proactive_min_interval: settingsService.getSettingValue<number>('ilink_proactive_chat_min_interval', 45),
    proactive_quiet_hours_start: settingsService.getSettingValue<number>('ilink_proactive_chat_quiet_hours_start', 0),
    proactive_quiet_hours_end: settingsService.getSettingValue<number>('ilink_proactive_chat_quiet_hours_end', 8),
    proactive_check_interval: settingsService.getSettingValue<number>('ilink_proactive_chat_check_interval', 5),
    proactive_system_prompt: settingsService.getSettingValue<string>(
      'ilink_proactive_chat_system_prompt',
      DEFAULT_PROACTIVE_SYSTEM_PROMPT
    ),
    proactive_user_message: settingsService.getSettingValue<string>(
      'ilink_proactive_chat_user_message',
      DEFAULT_PROACTIVE_USER_MESSAGE
    ),
    learning_prompt: settingsService.getSettingValue<string>(
      'ilink_learning_prompt',
      DEFAULT_ILINK_LEARNING_PROMPT
    )
  })
}

export function updateConfig(req: Request, res: Response): void {
  const {
    enabled,
    provider,
    model,
    system_prompt,
    note_tools_prompt,
    tool_usage_prompt,
    max_tool_rounds,
    reminder_interval,
    proactive_enabled,
    proactive_min_interval,
    proactive_quiet_hours_start,
    proactive_quiet_hours_end,
    proactive_check_interval,
    proactive_user_message,
    proactive_system_prompt,
    learning_prompt
  } = req.body

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
  if (note_tools_prompt !== undefined) {
    settingsService.setSetting('note_tools_prompt', note_tools_prompt)
  } else if (tool_usage_prompt !== undefined) {
    settingsService.setSetting('note_tools_prompt', tool_usage_prompt)
  }
  if (max_tool_rounds !== undefined) {
    settingsService.setSetting('ilink_max_tool_rounds', max_tool_rounds)
  }
  if (reminder_interval !== undefined) {
    settingsService.setSetting('ilink_reminder_interval', reminder_interval)
  }
  if (proactive_enabled !== undefined) {
    settingsService.setSetting('ilink_proactive_chat_enabled', proactive_enabled)
  }
  if (proactive_min_interval !== undefined) {
    settingsService.setSetting('ilink_proactive_chat_min_interval', proactive_min_interval)
  }
  if (proactive_quiet_hours_start !== undefined) {
    settingsService.setSetting('ilink_proactive_chat_quiet_hours_start', proactive_quiet_hours_start)
  }
  if (proactive_quiet_hours_end !== undefined) {
    settingsService.setSetting('ilink_proactive_chat_quiet_hours_end', proactive_quiet_hours_end)
  }
  if (proactive_check_interval !== undefined) {
    settingsService.setSetting('ilink_proactive_chat_check_interval', proactive_check_interval)
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

  // check_interval 变更时重建主动聊天定时器
  proactiveChat.updateProactiveChatConfig({
    enabled: proactive_enabled,
    minInterval: proactive_min_interval,
    quietHoursStart: proactive_quiet_hours_start,
    quietHoursEnd: proactive_quiet_hours_end,
    checkInterval: proactive_check_interval,
  })

  res.json({ success: true })
}

export async function startBot(req: Request, res: Response): Promise<void> {
  const result = await ilinkBot.startILinkBot()
  if (result.success) {
    res.json({ success: true, status: ilinkBot.getILinkBotStatus() })
  } else {
    res.status(400).json({ success: false, error: result.error })
  }
}

export function stopBot(req: Request, res: Response): void {
  const result = ilinkBot.stopILinkBot()
  if (result.success) {
    res.json({ success: true, status: ilinkBot.getILinkBotStatus() })
  } else {
    res.status(400).json({ success: false, error: result.error })
  }
}

export function getLoginStatus(req: Request, res: Response): void {
  res.json(ilinkBot.getLoginStatus())
}

export function resetLogin(req: Request, res: Response): void {
  ilinkBot.resetLoginState()
  res.json({ success: true })
}

export function getMessageHistory(req: Request, res: Response): void {
  const userId = getSingleParam(req.params.userId)
  if (!userId) {
    res.status(400).json({ error: 'BadRequest', message: 'userId is required' })
    return
  }
  res.json(ilinkBot.getMessageHistory(userId))
}

export function clearMessageHistory(req: Request, res: Response): void {
  const userId = getSingleParam(req.params.userId)
  ilinkBot.clearMessageHistory(userId)
  res.json({ success: true })
}

export function getReminderStatus(req: Request, res: Response): void {
  res.json(reminderService.getReminderStatus())
}

export async function triggerReminder(req: Request, res: Response): Promise<void> {
  res.json(await reminderService.triggerReminder())
}

export function clearRemindedTodos(req: Request, res: Response): void {
  reminderService.clearRemindedTodos()
  res.json({ success: true })
}

export function getProactiveChatConfig(req: Request, res: Response): void {
  const status = proactiveChat.getProactiveChatStatus()
  res.json({
    enabled: status.config.enabled,
    min_interval: status.config.minInterval,
    quiet_hours_start: status.config.quietHoursStart,
    quiet_hours_end: status.config.quietHoursEnd,
    check_interval: status.config.checkInterval,
    system_prompt: settingsService.getSettingValue<string>(
      'ilink_proactive_chat_system_prompt',
      DEFAULT_PROACTIVE_SYSTEM_PROMPT
    ),
    user_message: settingsService.getSettingValue<string>(
      'ilink_proactive_chat_user_message',
      DEFAULT_PROACTIVE_USER_MESSAGE
    )
  })
}

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

  proactiveChat.updateProactiveChatConfig({
    enabled,
    minInterval: min_interval,
    quietHoursStart: quiet_hours_start,
    quietHoursEnd: quiet_hours_end,
    checkInterval: check_interval
  })

  res.json({ success: true })
}

export function getReports(req: Request, res: Response): void {
  const type = getSingleParam(req.query.type) as reportService.ReportType | undefined
  const start = getSingleParam(req.query.start)
  const end = getSingleParam(req.query.end)
  res.json(reportService.listReports({ type, start, end }))
}

export function getReport(req: Request, res: Response): void {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'BadRequest', message: 'id must be an integer' })
    return
  }
  const report = reportService.getReportById(id)
  if (!report) {
    res.status(404).json({ error: 'NotFound', message: 'report not found' })
    return
  }
  res.json(report)
}
