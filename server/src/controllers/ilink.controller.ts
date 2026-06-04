import { Request, Response } from 'express'
import * as ilinkBot from '../services/wechat/ilink-bot.service.js'
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
      model: config.model,
      has_token: !!config.bot_token
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
    bot_token: config.bot_token ? '***' + config.bot_token.slice(-4) : '',
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
  const { enabled, bot_token, provider, model, system_prompt, max_tool_rounds } = req.body

  // 保存配置
  if (enabled !== undefined) {
    settingsService.setSetting('ilink_enabled', enabled)
  }
  if (bot_token !== undefined) {
    settingsService.setSetting('ilink_bot_token', bot_token)
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
