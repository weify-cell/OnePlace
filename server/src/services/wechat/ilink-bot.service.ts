import { ilinkClient } from './ilink.client.js'
import { streamChatWithPi } from '../ai/pi-ai.adapter.js'
import { getSettingValue } from '../settings.service.js'
import type { InboundMessage, ILinkBotConfig, ILinkBotStatus, DEFAULT_ILINK_CONFIG } from './types.js'

// Bot 状态
let botRunning = false
let botStartTime: number | null = null
let messagesProcessed = 0
let lastMessageAt: string | null = null
let lastError: string | null = null
let abortController: AbortController | null = null

// 消息上下文缓存（context_token → 最近的消息历史）
const messageHistory = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>()
const MAX_HISTORY_LENGTH = 20

/**
 * 获取 Bot 配置
 */
export function getILinkConfig(): ILinkBotConfig {
  return {
    enabled: getSettingValue<boolean>('ilink_enabled', false),
    bot_token: getSettingValue<string>('ilink_bot_token', ''),
    provider: getSettingValue<string>('ilink_provider', 'qwen'),
    model: getSettingValue<string>('ilink_model', 'qwen-turbo'),
    system_prompt: getSettingValue<string>('ilink_system_prompt', '你是一个智能助手，可以通过微信为用户提供服务。请用中文回复。'),
    max_tool_rounds: getSettingValue<number>('ilink_max_tool_rounds', 5)
  }
}

/**
 * 获取 Bot 状态
 */
export function getILinkBotStatus(): ILinkBotStatus {
  return {
    running: botRunning,
    uptime: botStartTime ? Date.now() - botStartTime : null,
    messages_processed: messagesProcessed,
    last_message_at: lastMessageAt,
    error: lastError
  }
}

/**
 * 处理单条消息
 */
async function handleMessage(message: InboundMessage, config: ILinkBotConfig): Promise<void> {
  const { context_token, content, msg_type, from_user } = message

  // 只处理文本消息
  if (msg_type !== 'text') {
    console.log(`[ilink] skipping non-text message from ${from_user}: ${msg_type}`)
    return
  }

  console.log(`[ilink] processing message from ${from_user}: ${content.slice(0, 50)}`)

  // 发送"正在输入"状态
  await ilinkClient.sendTyping(config.bot_token, { context_token })

  // 获取或创建消息历史
  let history = messageHistory.get(from_user) || []
  history.push({ role: 'user', content })

  // 保持历史长度限制
  if (history.length > MAX_HISTORY_LENGTH) {
    history = history.slice(-MAX_HISTORY_LENGTH)
  }

  try {
    // 调用 pi-ai 处理消息
    const result = await streamChatWithPi(
      config.provider,
      config.model,
      history,
      config.system_prompt,
      {
        onStart: () => {},
        onDelta: () => {},
        onDone: () => {},
        onError: (error) => {
          throw error
        }
      },
      {
        toolsEnabled: true,
        maxRounds: config.max_tool_rounds
      }
    )

    // 发送回复
    await ilinkClient.sendTextMessage(config.bot_token, context_token, result.content)

    // 更新消息历史
    history.push({ role: 'assistant', content: result.content })
    messageHistory.set(from_user, history)

    // 更新统计
    messagesProcessed++
    lastMessageAt = new Date().toISOString()
    lastError = null

    console.log(`[ilink] replied to ${from_user}: ${result.content.slice(0, 50)}...`)
  } catch (error) {
    const errMsg = (error as Error).message || 'Unknown error'
    console.error(`[ilink] failed to process message from ${from_user}:`, errMsg)
    lastError = errMsg

    // 发送错误回复
    try {
      await ilinkClient.sendTextMessage(
        config.bot_token,
        context_token,
        '抱歉，处理您的消息时出现了错误，请稍后再试。'
      )
    } catch (sendErr) {
      console.error('[ilink] failed to send error reply:', sendErr)
    }
  }
}

/**
 * 消息循环
 */
async function messageLoop(config: ILinkBotConfig): Promise<void> {
  console.log('[ilink] starting message loop')

  while (botRunning) {
    try {
      // 长轮询获取消息
      const response = await ilinkClient.getUpdates(config.bot_token)

      if (response.error) {
        console.error('[ilink] getUpdates error:', response.error)
        lastError = response.error

        // 如果是 token 失效，停止 Bot
        if (response.error.includes('token') || response.error.includes('unauthorized')) {
          console.error('[ilink] token invalid, stopping bot')
          break
        }

        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, 5000))
        continue
      }

      // 处理消息
      for (const message of response.messages) {
        if (!botRunning) break
        await handleMessage(message, config)
      }
    } catch (error) {
      if (!botRunning) break

      const errMsg = (error as Error).message || 'Unknown error'
      console.error('[ilink] message loop error:', errMsg)
      lastError = errMsg

      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }

  console.log('[ilink] message loop stopped')
}

/**
 * 启动 Bot
 */
export async function startILinkBot(): Promise<{ success: boolean; error?: string }> {
  if (botRunning) {
    return { success: false, error: 'Bot is already running' }
  }

  const config = getILinkConfig()
  if (!config.enabled) {
    return { success: false, error: 'Bot is not enabled' }
  }

  if (!config.bot_token) {
    return { success: false, error: 'Bot token is not configured' }
  }

  // 验证 token
  try {
    const testResponse = await ilinkClient.getUpdates(config.bot_token, 1)
    if (testResponse.error) {
      return { success: false, error: `Token validation failed: ${testResponse.error}` }
    }
  } catch (error) {
    return { success: false, error: `Token validation failed: ${(error as Error).message}` }
  }

  // 启动 Bot
  botRunning = true
  botStartTime = Date.now()
  lastError = null
  abortController = new AbortController()

  // 异步启动消息循环
  messageLoop(config).catch(error => {
    console.error('[ilink] message loop crashed:', error)
    lastError = (error as Error).message
    botRunning = false
    botStartTime = null
  })

  console.log('[ilink] bot started')
  return { success: true }
}

/**
 * 停止 Bot
 */
export function stopILinkBot(): { success: boolean; error?: string } {
  if (!botRunning) {
    return { success: false, error: 'Bot is not running' }
  }

  botRunning = false
  abortController?.abort()
  abortController = null
  botStartTime = null

  console.log('[ilink] bot stopped')
  return { success: true }
}

/**
 * 获取消息历史（用于调试）
 */
export function getMessageHistory(userId: string): Array<{ role: string; content: string }> {
  return messageHistory.get(userId) || []
}

/**
 * 清除消息历史
 */
export function clearMessageHistory(userId?: string): void {
  if (userId) {
    messageHistory.delete(userId)
  } else {
    messageHistory.clear()
  }
}
