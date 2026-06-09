import { WeChatBot } from '@wechatbot/wechatbot'
import { streamChatWithPi } from '../ai/pi-ai.adapter.js'
import { getSettingValue } from '../settings.service.js'
import { connectDatabase } from '../../database/index.js'

// 定时器
let proactiveTimer: ReturnType<typeof setInterval> | null = null
let bot: WeChatBot | null = null

// 配置缓存
interface ProactiveChatConfig {
  enabled: boolean
  minInterval: number // 最小聊天间隔（分钟）
  quietHoursStart: number // 安静时段开始（小时）
  quietHoursEnd: number // 安静时段结束（小时）
  checkInterval: number // 检查间隔（分钟）
}

// 上次发送时间记录（userId -> timestamp）
const lastSentTime = new Map<string, number>()

/**
 * 获取北京时间的小时数（0-23）
 */
function getBeijingHour(): number {
  const now = new Date()
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Shanghai',
    hour: 'numeric',
    hour12: false
  }
  const formatter = new Intl.DateTimeFormat('en-US', options)
  return parseInt(formatter.format(now), 10)
}

/**
 * 获取当前北京时间的时间戳
 */
function getBeijingTimestamp(): number {
  return Date.now()
}

/**
 * 检查是否在安静时段（0:00-8:00 北京时间）
 */
function isQuietHours(config: ProactiveChatConfig): boolean {
  const hour = getBeijingHour()
  return hour >= config.quietHoursStart && hour < config.quietHoursEnd
}

/**
 * 从数据库读取主动聊天配置
 */
function getProactiveChatConfig(): ProactiveChatConfig {
  return {
    enabled: getSettingValue<boolean>('ilink_proactive_chat_enabled', true),
    minInterval: getSettingValue<number>('ilink_proactive_chat_min_interval', 45),
    quietHoursStart: getSettingValue<number>('ilink_proactive_chat_quiet_hours_start', 0),
    quietHoursEnd: getSettingValue<number>('ilink_proactive_chat_quiet_hours_end', 8),
    checkInterval: getSettingValue<number>('ilink_proactive_chat_check_interval', 5)
  }
}

/**
 * 获取所有微信用户 ID
 */
function getWeChatUsers(): string[] {
  const db = connectDatabase()
  const rows = db.prepare(`
    SELECT DISTINCT key as userId
    FROM settings
    WHERE key LIKE 'ilink_user_%'
    LIMIT 10
  `).all() as Array<{ userId: string }>

  return rows.map(r => r.userId.replace('ilink_user_', ''))
}

/**
 * 获取用户最后发消息的时间
 */
function getUserLastMessageTime(userId: string): number | null {
  const db = connectDatabase()
  const row = db.prepare(`
    SELECT updated_at
    FROM settings
    WHERE key = ?
  `).get(`ilink_user_${userId}`) as { updated_at: string } | undefined

  if (!row || !row.updated_at) {
    return null
  }

  return new Date(row.updated_at).getTime()
}

/**
 * 根据用户最后发消息时间计算触发权重
 * 返回 0-1 之间的概率值
 */
function calculateTriggerWeight(lastMessageTime: number | null): number {
  if (!lastMessageTime) {
    // 没有记录，给一个默认权重
    return 0.5
  }

  const now = getBeijingTimestamp()
  const hoursSinceLastMessage = (now - lastMessageTime) / (1000 * 60 * 60)

  if (hoursSinceLastMessage < 1) {
    // 1 小时内，不触发
    return 0
  } else if (hoursSinceLastMessage < 2) {
    // 1-2 小时：30% 概率
    return 0.3
  } else if (hoursSinceLastMessage < 4) {
    // 2-4 小时：50% 概率
    return 0.5
  } else if (hoursSinceLastMessage < 8) {
    // 4-8 小时：70% 概率
    return 0.7
  } else {
    // > 8 小时：90% 概率
    return 0.9
  }
}

/**
 * 检查是否超过最小聊天间隔
 */
function hasMinIntervalPassed(userId: string, minIntervalMinutes: number): boolean {
  const lastSent = lastSentTime.get(userId)
  if (!lastSent) {
    return true
  }

  const now = getBeijingTimestamp()
  const minutesSinceLastSent = (now - lastSent) / (1000 * 60)
  return minutesSinceLastSent >= minIntervalMinutes
}

/**
 * 使用 AI 生成主动聊天内容
 */
async function generateProactiveMessage(userId: string): Promise<string> {
  const config = getProactiveChatConfig()

  // 获取 AI 配置
  const provider = getSettingValue<string>('ilink_provider', 'qwen')
  const model = getSettingValue<string>('ilink_model', 'qwen-turbo')

  const systemPrompt = `你是一个友好的微信助手。现在你想主动找用户聊天，保持轻松友好的语气。
请生成一条简短、自然的问候或话题开启消息，就像朋友之间发微信一样。
注意：
1. 不要太长，控制在 1-2 句话
2. 不要太正式，要亲切自然
3. 可以问问用户今天怎么样，或者分享一个有趣的话题
4. 使用中文
5. 不要使用表情符号`

  const messages = [
    { role: 'user' as const, content: '请生成一条主动聊天的消息' }
  ]

  try {
    const result = await streamChatWithPi(
      provider,
      model,
      messages,
      systemPrompt,
      {
        onStart: () => {},
        onDelta: () => {},
        onDone: () => {},
        onError: (error) => {
          throw error
        }
      },
      {
        toolsEnabled: false
      }
    )

    return result.content || '你好！最近怎么样？'
  } catch (error) {
    console.error(`[proactive] failed to generate message:`, error)
    // 返回默认消息
    const defaultMessages = [
      '你好！今天过得怎么样？',
      '在忙什么呢？',
      '最近有什么新鲜事吗？',
      '休息一下，聊聊天吧！',
      '今天天气不错，你那边怎么样？'
    ]
    return defaultMessages[Math.floor(Math.random() * defaultMessages.length)]
  }
}

/**
 * 发送主动消息给用户
 */
async function sendProactiveMessage(userId: string): Promise<boolean> {
  if (!bot) {
    console.error('[proactive] bot instance not set')
    return false
  }

  try {
    const message = await generateProactiveMessage(userId)
    await bot.send(userId, message)

    // 更新发送时间
    lastSentTime.set(userId, getBeijingTimestamp())

    console.log(`[proactive] sent message to ${userId}: ${message.slice(0, 50)}...`)
    return true
  } catch (error) {
    console.error(`[proactive] failed to send message to ${userId}:`, error)
    return false
  }
}

/**
 * 检查并发送主动消息
 */
async function checkAndSendProactiveMessages(): Promise<void> {
  const config = getProactiveChatConfig()

  // 检查功能是否启用
  if (!config.enabled) {
    return
  }

  // 检查是否在安静时段
  if (isQuietHours(config)) {
    return
  }

  // 获取所有用户
  const users = getWeChatUsers()

  if (users.length === 0) {
    return
  }

  console.log(`[proactive] checking ${users.length} users`)

  for (const userId of users) {
    // 检查最小间隔
    if (!hasMinIntervalPassed(userId, config.minInterval)) {
      continue
    }

    // 获取用户最后消息时间
    const lastMessageTime = getUserLastMessageTime(userId)

    // 计算触发权重
    const weight = calculateTriggerWeight(lastMessageTime)

    // 根据权重决定是否触发
    if (Math.random() < weight) {
      console.log(`[proactive] triggered for user ${userId} (weight: ${weight})`)
      await sendProactiveMessage(userId)
    }
  }
}

/**
 * 设置 Bot 实例
 */
export function setProactiveBot(botInstance: WeChatBot): void {
  bot = botInstance
}

/**
 * 启动主动聊天服务
 */
export function startProactiveChatService(intervalMinutes?: number): void {
  if (proactiveTimer) {
    console.log('[proactive] service already running')
    return
  }

  const config = getProactiveChatConfig()
  const interval = intervalMinutes || config.checkInterval

  console.log(`[proactive] starting proactive chat service (interval: ${interval}min)`)

  // 延迟 30 秒后开始第一次检查（等待系统初始化完成）
  setTimeout(() => {
    checkAndSendProactiveMessages()
  }, 30000)

  // 设置定时器
  proactiveTimer = setInterval(checkAndSendProactiveMessages, interval * 60 * 1000)
}

/**
 * 停止主动聊天服务
 */
export function stopProactiveChatService(): void {
  if (proactiveTimer) {
    clearInterval(proactiveTimer)
    proactiveTimer = null
    console.log('[proactive] service stopped')
  }
}

/**
 * 手动触发主动消息检查
 */
export async function triggerProactiveCheck(): Promise<{ success: boolean; sent: number }> {
  const config = getProactiveChatConfig()

  if (!config.enabled) {
    return { success: true, sent: 0 }
  }

  if (isQuietHours(config)) {
    console.log('[proactive] in quiet hours, skipping')
    return { success: true, sent: 0 }
  }

  const users = getWeChatUsers()
  let sentCount = 0

  for (const userId of users) {
    if (!hasMinIntervalPassed(userId, config.minInterval)) {
      continue
    }

    const lastMessageTime = getUserLastMessageTime(userId)
    const weight = calculateTriggerWeight(lastMessageTime)

    // 手动触发时，权重 > 0 就发送
    if (weight > 0) {
      const sent = await sendProactiveMessage(userId)
      if (sent) {
        sentCount++
      }
    }
  }

  return { success: true, sent: sentCount }
}

/**
 * 获取主动聊天服务状态
 */
export function getProactiveChatStatus(): {
  running: boolean
  config: ProactiveChatConfig
  lastSentTimes: Record<string, string>
  isQuietHours: boolean
} {
  const config = getProactiveChatConfig()
  const lastSentTimesRecord: Record<string, string> = {}

  lastSentTime.forEach((timestamp, userId) => {
    lastSentTimesRecord[userId] = new Date(timestamp).toISOString()
  })

  return {
    running: proactiveTimer !== null,
    config,
    lastSentTimes: lastSentTimesRecord,
    isQuietHours: isQuietHours(config)
  }
}

/**
 * 更新主动聊天配置
 */
export function updateProactiveChatConfig(updates: Partial<ProactiveChatConfig>): void {
  // 配置已经通过 settings service 管理
  // 这里只是更新内存中的缓存
  console.log('[proactive] config updated:', updates)
}
