import { WeChatBot } from '@wechatbot/wechatbot'
import { streamChatWithPi } from '../ai/pi-ai.adapter.js'
import { getSettingValue, setSetting } from '../settings.service.js'

// Bot 实例
let bot: WeChatBot | null = null
let botRunning = false
let botStartTime: number | null = null
let messagesProcessed = 0
let lastMessageAt: string | null = null
let lastError: string | null = null

// 登录状态
let loginQRCode: string | null = null
let loginStatus: 'idle' | 'waiting' | 'scanned' | 'confirmed' | 'expired' = 'idle'

// 消息历史（userId → 消息列表）
const messageHistory = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>()
const MAX_HISTORY_LENGTH = 20

/**
 * 获取 Bot 配置
 */
export function getILinkConfig() {
  return {
    enabled: getSettingValue<boolean>('ilink_enabled', false),
    provider: getSettingValue<string>('ilink_provider', 'qwen'),
    model: getSettingValue<string>('ilink_model', 'qwen-turbo'),
    system_prompt: getSettingValue<string>('ilink_system_prompt', '你是一个智能助手，可以通过微信为用户提供服务。请用中文回复。'),
    max_tool_rounds: getSettingValue<number>('ilink_max_tool_rounds', 5)
  }
}

/**
 * 获取 Bot 状态
 */
export function getILinkBotStatus() {
  return {
    running: botRunning,
    uptime: botStartTime ? Date.now() - botStartTime : null,
    messages_processed: messagesProcessed,
    last_message_at: lastMessageAt,
    error: lastError,
    login: {
      status: loginStatus,
      qrcode: loginQRCode
    }
  }
}

/**
 * 获取登录状态
 */
export function getLoginStatus() {
  return {
    status: loginStatus,
    qrcode: loginQRCode
  }
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

  try {
    // 创建 Bot 实例
    bot = new WeChatBot({
      storage: 'file',
      logLevel: 'info',
      loginCallbacks: {
        onQrUrl: (url: string) => {
          console.log('[ilink] QR code URL:', url)
          loginQRCode = url
          loginStatus = 'waiting'
        },
        onScanned: () => {
          console.log('[ilink] QR code scanned')
          loginStatus = 'scanned'
        },
        onExpired: () => {
          console.log('[ilink] QR code expired')
          loginStatus = 'expired'
          loginQRCode = null
        }
      }
    })

    // 监听事件
    bot.on('login', (creds: any) => {
      console.log('[ilink] logged in:', creds.accountId)
      loginStatus = 'confirmed'
      loginQRCode = null
    })

    bot.on('session:expired', () => {
      console.log('[ilink] session expired')
      lastError = 'Session expired'
    })

    bot.on('error', (err: Error) => {
      console.error('[ilink] bot error:', err)
      lastError = err.message
    })

    // 消息处理
    bot.onMessage(async (msg: any) => {
      console.log(`[ilink] message from ${msg.userId}: ${msg.text?.slice(0, 50)}`)

      // 只处理文本消息
      if (!msg.text) {
        console.log(`[ilink] skipping non-text message`)
        return
      }

      // 发送"正在输入"状态
      await bot!.sendTyping(msg.userId)

      // 获取或创建消息历史
      let history = messageHistory.get(msg.userId) || []
      history.push({ role: 'user', content: msg.text })

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

        // 回复消息
        await bot!.reply(msg, result.content)

        // 更新消息历史
        history.push({ role: 'assistant', content: result.content })
        messageHistory.set(msg.userId, history)

        // 更新统计
        messagesProcessed++
        lastMessageAt = new Date().toISOString()
        lastError = null

        console.log(`[ilink] replied to ${msg.userId}: ${result.content.slice(0, 50)}...`)
      } catch (error) {
        const errMsg = (error as Error).message || 'Unknown error'
        console.error(`[ilink] failed to process message:`, errMsg)
        lastError = errMsg

        // 发送错误回复
        try {
          await bot!.reply(msg, '抱歉，处理您的消息时出现了错误，请稍后再试。')
        } catch (replyErr) {
          console.error('[ilink] failed to send error reply:', replyErr)
        }
      }
    })

    // 登录
    console.log('[ilink] logging in...')
    await bot.login()

    // 启动
    console.log('[ilink] starting bot...')
    await bot.start()

    botRunning = true
    botStartTime = Date.now()
    lastError = null

    console.log('[ilink] bot started')
    return { success: true }
  } catch (error) {
    const errMsg = (error as Error).message || 'Unknown error'
    console.error('[ilink] failed to start bot:', errMsg)
    lastError = errMsg
    bot = null
    return { success: false, error: errMsg }
  }
}

/**
 * 停止 Bot
 */
export function stopILinkBot(): { success: boolean; error?: string } {
  if (!botRunning || !bot) {
    return { success: false, error: 'Bot is not running' }
  }

  try {
    // WeChatBot 没有 stop 方法，直接清理状态
    bot = null
    botRunning = false
    botStartTime = null

    console.log('[ilink] bot stopped')
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

/**
 * 获取消息历史（调试用）
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

/**
 * 重置登录状态
 */
export function resetLoginState(): void {
  loginStatus = 'idle'
  loginQRCode = null
}
