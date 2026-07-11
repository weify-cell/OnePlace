import { WeChatBot } from '@wechatbot/wechatbot'
import { AgentPool } from '../ai/agent-pool.js'
import { createStreamFn, createModel, convertMessages, extractApiKey, type ChatMessage } from '../ai/pi-ai.adapter.js'
import { getBuiltinTools } from '../ai/builtin-tools.js'
import { getSetting, getSettingValue, setSetting } from '../settings.service.js'
import { connectDatabase } from '../../database/index.js'
import { setReminderBot, startReminderService, stopReminderService, saveWeChatUser, sendPendingReminders, hasPendingReminders } from './todo-reminder.service.js'
import { setProactiveBot, startProactiveChatService, stopProactiveChatService } from './proactive-chat.service.js'

/**
 * 格式化当前时间为北京时间字符串
 */
export function formatBeijingTime(): string {
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
  const weekDay = now.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    weekday: 'long'
  })
  return `[${timestamp} ${weekDay} 北京时间]`
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

let agentPool: AgentPool | null = null

// 消息历史持久化到数据库
const MAX_HISTORY_LENGTH = 100

// 用户模式状态
const userModes = new Map<string, { mode: 'normal' | 'learning'; learningTopic: string }>()

// 学习模式 systemPrompt 模板
function getLearningPrompt(topic: string): string {
  const template = getSettingValue<string>('ilink_learning_prompt', '你是一个学习导师，正在帮助用户学习「{topic}」。请按以下方式教学：1. 先使用 search_knowledge_base 和 get_note 工具检索用户的笔记资料 2. 以问答方式测试用户对知识点的掌握 3. 根据用户的回答给予反馈和补充解释 4. 控制每次提问1-2个问题，不要连续轰炸 5. 用户答对时鼓励，答错时耐心纠正 6. 如果笔记中没有相关内容，诚实告知并给出通用知识')
  return template.replace('{topic}', topic)
}

function initAgentPool(provider: string, modelId: string): void {
  const model = createModel(provider, modelId)
  const streamFn = createStreamFn()
  const tools = getBuiltinTools()
  agentPool = new AgentPool(
    streamFn, tools, model,
    (p) => extractApiKey(p),
    ''
  )
}

/**
 * 检查用户是否在学习模式
 */
export function isUserInLearningMode(userId: string): boolean {
  const userMode = userModes.get(userId)
  return userMode?.mode === 'learning'
}

/**
 * 获取用户学习模式信息
 */
export function getUserLearningMode(userId: string): { mode: 'normal' | 'learning'; learningTopic: string } | null {
  return userModes.get(userId) || null
}

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
  initAgentPool(config.provider, config.model)

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

      // 命令解析：/学习 主题
      if (msg.text?.startsWith('/学习 ')) {
        const topic = msg.text.slice(4).trim()
        if (!topic) {
          await bot!.reply(msg, '请指定学习主题，例如：/学习 Python')
          return
        }
        userModes.set(msg.userId, { mode: 'learning', learningTopic: topic })
        await bot!.reply(msg, `已进入学习模式，正在准备「${topic}」的学习内容...`)
        return
      }

      // 命令解析：/退出
      if (msg.text?.trim() === '/退出') {
        userModes.delete(msg.userId)
        await bot!.reply(msg, '已退出学习模式，恢复普通聊天。')
        return
      }

      // 命令解析：/清空上下文
      if (msg.text?.trim() === '/清空上下文') {
        clearMessageHistory(msg.userId)
        userModes.delete(msg.userId)
        agentPool?.remove(msg.userId)
        await bot!.reply(msg, '已清空当前对话上下文。')
        return
      }

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

      // 发送"正在输入"状态
      await bot!.sendTyping(msg.userId)

      try {
        const pool = agentPool!
        const userMode = userModes.get(msg.userId)
        const effectivePrompt = userMode?.mode === 'learning'
          ? getLearningPrompt(userMode.learningTopic)
          : config.system_prompt

        const agent = pool.getOrCreate(msg.userId, () => {
          const dbHistory = getMessageHistory(msg.userId)
          return convertMessages(dbHistory as ChatMessage[])
        })

        const timestamp = formatBeijingTime()
        const systemMsg: ChatMessage = { role: 'system', content: effectivePrompt }
        const userMsg: ChatMessage = { role: 'user', content: `${timestamp} ${msg.text}` }

        let replyContent = ''
        const unsub = agent.subscribe((event, _signal) => {
          if (event.type === 'turn_end') {
            const msg = event.message
            if (msg.role === 'assistant') {
              if (Array.isArray(msg.content)) {
                replyContent = msg.content
                  .filter(c => (c as { type: string }).type === 'text')
                  .map(c => (c as { text: string }).text).join('')
              } else if (typeof msg.content === 'string') {
                replyContent = msg.content
              }
              // 错误日志：通过 errorMessage 字符串存在性判断
              const errMsg = (msg as { errorMessage?: string }).errorMessage
              if (!replyContent && errMsg) {
                console.error(`[ilink] Agent error: ${errMsg}`)
              }
            }
          } else if (event.type === 'agent_end') {
            if (!replyContent) {
              const lastMsg = event.messages[event.messages.length - 1]
              if (lastMsg && lastMsg.role === 'assistant') {
                replyContent = Array.isArray(lastMsg.content)
                  ? lastMsg.content
                      .filter(c => (c as { type: string }).type === 'text')
                      .map(c => (c as { text: string }).text).join('')
                  : ''
              }
            }
          }
        })

        await agent.prompt(convertMessages([systemMsg, userMsg]))
        await agent.waitForIdle()
        unsub()

        await bot!.reply(msg, replyContent || '抱歉，没有生成回复。')

        addMessageToHistory(msg.userId, 'user', `${timestamp} ${msg.text}`)
        addMessageToHistory(msg.userId, 'assistant', replyContent)
        messagesProcessed++
        lastMessageAt = new Date().toISOString()
        lastError = null
      } catch (error) {
        const errMsg = (error as Error).message || 'Unknown error'
        console.error(`[ilink] 处理消息失败:`, errMsg)
        lastError = errMsg
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
    agentPool?.shutdown()
    agentPool = null

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
 * 获取消息历史（从数据库读取，最近100条）
 */
export function getMessageHistory(userId: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  const db = connectDatabase()
  const rows = db.prepare(`
    SELECT role, content FROM wechat_messages
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(userId, MAX_HISTORY_LENGTH) as { role: string; content: string }[]
  return rows.reverse() as Array<{ role: 'user' | 'assistant'; content: string }>
}

/**
 * 添加消息到历史记录（持久化到数据库）
 */
export function addMessageToHistory(userId: string, role: 'user' | 'assistant', content: string): void {
  const db = connectDatabase()
  db.prepare(`
    INSERT INTO wechat_messages (user_id, role, content)
    VALUES (?, ?, ?)
  `).run(userId, role, content)

  // 删除超出限制的旧消息
  db.prepare(`
    DELETE FROM wechat_messages
    WHERE user_id = ? AND id NOT IN (
      SELECT id FROM wechat_messages
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
    )
  `).run(userId, userId, MAX_HISTORY_LENGTH)
}

/**
 * 清除消息历史
 */
export function clearMessageHistory(userId?: string): void {
  const db = connectDatabase()
  if (userId) {
    db.prepare('DELETE FROM wechat_messages WHERE user_id = ?').run(userId)
  } else {
    db.prepare('DELETE FROM wechat_messages').run()
  }
}

/**
 * 重置登录状态
 */
export function resetLoginState(): void {
  loginStatus = 'idle'
  loginQRCode = null
}
