import { WeChatBot } from '@wechatbot/wechatbot'
import { streamChatWithPi } from '../ai/pi-ai.adapter.js'
import { getSettingValue, setSetting } from '../settings.service.js'
import { setReminderBot, startReminderService, stopReminderService, saveWeChatUser, sendPendingReminders, hasPendingReminders } from './todo-reminder.service.js'
import { setProactiveBot, startProactiveChatService, stopProactiveChatService } from './proactive-chat.service.js'

/**
 * 格式化当前时间为北京时间字符串
 */
function formatBeijingTime(): string {
  const now = new Date()
  const timestamp = now.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  return `[${timestamp} 北京时间]`
}

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
 * 启动 Bot（异步启动，不等待登录完成）
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
      logLevel: 'info'
    })

    // 监听事件
    bot.on('login', (creds: any) => {
      console.log('[ilink] ================================')
      console.log('[ilink] 登录成功!', creds.accountId)
      console.log('[ilink] ================================')
      loginStatus = 'confirmed'
      loginQRCode = null
      botRunning = true
      botStartTime = Date.now()
      lastError = null
    })

    bot.on('session:expired', () => {
      console.log('[ilink] 会话已过期')
      lastError = 'Session expired'
      botRunning = false
    })

    bot.on('error', (err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error('[ilink] Bot 错误:', err)
      lastError = error.message
    })

    // 消息处理
    bot.onMessage(async (msg: any) => {
      console.log(`[ilink] 收到消息 ${msg.userId}: ${msg.text?.slice(0, 50)}`)

      // 保存用户 ID（用于提醒服务）
      saveWeChatUser(msg.userId)

      // 检查是否有待发送的提醒（context_token 过期后积压的）
      if (hasPendingReminders(msg.userId)) {
        console.log(`[ilink] 发现待发送提醒，正在补发给 ${msg.userId}`)
        await sendPendingReminders(msg.userId)
      }

      // 只处理文本消息
      if (!msg.text) {
        console.log(`[ilink] 跳过非文本消息`)
        return
      }

      // 添加时间戳到消息
      const timestamp = formatBeijingTime()
      const messageWithTime = `${timestamp} ${msg.text}`

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
        // 调用 pi-ai 处理消息（使用带时间戳的消息）
        const result = await streamChatWithPi(
          config.provider,
          config.model,
          [...history.slice(0, -1), { role: 'user', content: messageWithTime }],
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

        // 更新消息历史（使用原始消息）
        history.push({ role: 'assistant', content: result.content })
        messageHistory.set(msg.userId, history)

        // 更新统计
        messagesProcessed++
        lastMessageAt = new Date().toISOString()
        lastError = null

        console.log(`[ilink] 已回复 ${msg.userId}: ${result.content.slice(0, 50)}...`)
      } catch (error) {
        const errMsg = (error as Error).message || 'Unknown error'
        console.error(`[ilink] 处理消息失败:`, errMsg)
        lastError = errMsg

        // 发送错误回复
        try {
          await bot!.reply(msg, '抱歉，处理您的消息时出现了错误，请稍后再试。')
        } catch (replyErr) {
          console.error('[ilink] 发送错误回复失败:', replyErr)
        }
      }
    })

    // 异步启动（不等待登录完成）
    console.log('[ilink] 正在启动 Bot...')
    loginStatus = 'waiting'

    // 异步执行登录和启动
    ;(async () => {
      try {
        // 登录（会显示二维码）
        console.log('[ilink] 正在获取二维码...')
        await bot!.login({
          callbacks: {
            onQrUrl: (url: string) => {
              console.log('[ilink] ================================')
              console.log('[ilink] 请扫描二维码登录:')
              console.log('[ilink]', url)
              console.log('[ilink] ================================')
              loginQRCode = url
              loginStatus = 'waiting'
            },
            onScanned: () => {
              console.log('[ilink] 已扫码，请在手机上确认登录')
              loginStatus = 'scanned'
            },
            onExpired: () => {
              console.log('[ilink] 二维码已过期')
              loginStatus = 'expired'
              loginQRCode = null
            }
          }
        })

        // 登录成功后启动消息循环
        console.log('[ilink] 登录成功，正在启动消息循环...')

        // 延迟启动提醒服务和主动聊天服务（等待 contextStore 加载完成）
        setTimeout(() => {
          setReminderBot(bot!)
          const reminderInterval = getSettingValue<number>('ilink_reminder_interval', 60)
          startReminderService(reminderInterval)
          console.log(`[ilink] reminder service started (interval: ${reminderInterval}min)`)

          // 启动主动聊天服务
          setProactiveBot(bot!)
          startProactiveChatService()
          console.log('[ilink] proactive chat service started')
        }, 2000) // 延迟 2 秒，确保 contextStore 加载完成

        await bot!.start()
        console.log('[ilink] Bot 已启动并运行')
      } catch (err) {
        console.error('[ilink] Bot 启动失败:', err)
        lastError = (err as Error).message
        loginStatus = 'idle'
        botRunning = false
        bot = null
      }
    })()

    // 等待一小段时间，让二维码 URL 显示
    await new Promise(resolve => setTimeout(resolve, 1000))

    return { success: true }
  } catch (error) {
    const errMsg = (error as Error).message || 'Unknown error'
    console.error('[ilink] 创建 Bot 失败:', errMsg)
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
    // 停止提醒服务
    stopReminderService()

    // 停止主动聊天服务
    stopProactiveChatService()

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
export function getMessageHistory(userId: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messageHistory.get(userId) || []
}

/**
 * 添加消息到历史记录
 */
export function addMessageToHistory(userId: string, role: 'user' | 'assistant', content: string): void {
  let history = messageHistory.get(userId) || []
  history.push({ role, content })

  // 保持历史长度限制
  if (history.length > MAX_HISTORY_LENGTH) {
    history = history.slice(-MAX_HISTORY_LENGTH)
  }

  messageHistory.set(userId, history)
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
