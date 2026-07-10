import { WeChatBot } from '@wechatbot/wechatbot'
import { createStreamFn, createModel, convertMessages, type ChatMessage } from '../ai/pi-ai.adapter.js'
import { getSettingValue } from '../settings.service.js'
import { connectDatabase } from '../../database/index.js'
import { addMessageToHistory, isUserInLearningMode } from './ilink-bot.service.js'

let proactiveTimer: ReturnType<typeof setInterval> | null = null
let proactiveInitTimer: ReturnType<typeof setTimeout> | null = null
let bot: WeChatBot | null = null

interface ProactiveChatConfig {
  enabled: boolean
  minInterval: number
  quietHoursStart: number
  quietHoursEnd: number
  checkInterval: number
}

function getBeijingHour(): number {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Shanghai',
    hour: 'numeric',
    hour12: false
  }
  return parseInt(new Intl.DateTimeFormat('en-US', options).format(new Date()), 10)
}

function isQuietHours(config: ProactiveChatConfig): boolean {
  const hour = getBeijingHour()
  if (config.quietHoursStart <= config.quietHoursEnd) {
    return hour >= config.quietHoursStart && hour < config.quietHoursEnd
  }
  // Wraps around midnight, e.g. 22 - 6
  return hour >= config.quietHoursStart || hour < config.quietHoursEnd
}

function getProactiveChatConfig(): ProactiveChatConfig {
  return {
    enabled: getSettingValue<boolean>('ilink_proactive_chat_enabled', true),
    minInterval: getSettingValue<number>('ilink_proactive_chat_min_interval', 45),
    quietHoursStart: getSettingValue<number>('ilink_proactive_chat_quiet_hours_start', 0),
    quietHoursEnd: getSettingValue<number>('ilink_proactive_chat_quiet_hours_end', 8),
    checkInterval: getSettingValue<number>('ilink_proactive_chat_check_interval', 5)
  }
}

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

/** Read last proactive-sent time from DB (persists across restarts). */
function getDbLastSentTime(userId: string): number | null {
  const db = connectDatabase()
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`)
    .get(`ilink_proactive_last_sent_${userId}`) as { value: string } | undefined
  if (!row) return null
  const ts = Number(row.value)
  return Number.isFinite(ts) ? ts : null
}

/** Persist last proactive-sent time to DB. */
function setDbLastSentTime(userId: string, ts: number): void {
  const db = connectDatabase()
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(`ilink_proactive_last_sent_${userId}`, String(ts))
}

/** Read the user's last interaction time (user message or proactive send, whichever is later). */
function getUserLastInteractionTime(userId: string): number | null {
  const db = connectDatabase()
  const row = db.prepare(`SELECT updated_at FROM settings WHERE key = ?`)
    .get(`ilink_user_${userId}`) as { updated_at: string } | undefined
  const userMsgTime = row?.updated_at ? new Date(row.updated_at).getTime() : null
  const sentTime = getDbLastSentTime(userId)
  return Math.max(userMsgTime ?? 0, sentTime ?? 0) || null
}

function calculateTriggerWeight(lastInteractionTime: number | null): number {
  if (!lastInteractionTime) return 0.5
  const hoursSince = (Date.now() - lastInteractionTime) / (1000 * 60 * 60)
  if (hoursSince < 1) return 0
  if (hoursSince < 2) return 0.3
  if (hoursSince < 4) return 0.5
  if (hoursSince < 8) return 0.7
  return 0.9
}

function hasMinIntervalPassed(userId: string, minIntervalMinutes: number): boolean {
  const lastSent = getDbLastSentTime(userId)
  if (!lastSent) return true
  return (Date.now() - lastSent) >= minIntervalMinutes * 60 * 1000
}

async function generateProactiveMessage(userId: string): Promise<string> {
  const provider = getSettingValue<string>('ilink_provider', 'qwen')
  const model = getSettingValue<string>('ilink_model', 'qwen-turbo')

  // 主动聊天专用 systemPrompt
  const systemPrompt = getSettingValue<string>('ilink_proactive_chat_system_prompt', '你是一个友好的微信助手，请主动找用户聊天。语气亲切随意，控制在1-2句话，可以使用表情符号。')

  // 获取可配置的用户消息，作为主动聊天的触发指令
  const userMessage = getSettingValue<string>('ilink_proactive_chat_user_message', '请生成一条主动问候消息')
  // 共用 messageHistory，加上触发指令（附加时间戳）
  const { getMessageHistory, formatBeijingTime } = await import('./ilink-bot.service.js')
  const timestamp = formatBeijingTime()
  const history = getMessageHistory(userId) || []
  history.push({ role: 'user', content: `${timestamp} ${userMessage}` })

  try {
    const modelObj = createModel(provider, model)
    const streamFn = createStreamFn()
    const messages = convertMessages(history as ChatMessage[])
    const context = { systemPrompt, messages, tools: undefined }

    let eventStream = streamFn(modelObj, context, {})
    if (eventStream instanceof Promise) {
      eventStream = await eventStream
    }
    let content = ''
    for await (const event of eventStream) {
      if ('content' in event && typeof event.content === 'string') {
        content += event.content
      }
    }
    return content.trim() || pickDefaultMessage()
  } catch (error) {
    console.error('[proactive] failed to generate message:', error)
    return pickDefaultMessage()
  }
}

function pickDefaultMessage(): string {
  const defaults = [
    '你好！最近怎么样？',
    '在忙什么呢？',
    '最近有什么新鲜事吗？',
    '休息一下，聊聊天吧！',
    '今天天气不错，你那边怎么样？'
  ]
  return defaults[Math.floor(Math.random() * defaults.length)]
}

/** Send a proactive message. Only writes history after successful send. */
async function sendProactiveMessage(userId: string): Promise<boolean> {
  if (!bot) {
    console.error('[proactive] bot instance not set')
    return false
  }

  try {
    const message = await generateProactiveMessage(userId)
    await bot.send(userId, message)

    // 共用 messageHistory：也写入触发指令，保证交替格式
    const { formatBeijingTime } = await import('./ilink-bot.service.js')
    const timestamp = formatBeijingTime()
    const userMessage = getSettingValue<string>('ilink_proactive_chat_user_message', '请生成一条主动问候消息')
    addMessageToHistory(userId, 'user', `${timestamp} ${userMessage}`)
    addMessageToHistory(userId, 'assistant', message)
    setDbLastSentTime(userId, Date.now())

    console.log(`[proactive] sent message to ${userId}: ${message.slice(0, 50)}...`)
    return true
  } catch (error) {
    console.error(`[proactive] failed to send message to ${userId}:`, error)
    return false
  }
}

async function checkAndSendProactiveMessages(): Promise<void> {
  const config = getProactiveChatConfig()
  if (!config.enabled) return
  if (isQuietHours(config)) return

  const users = getWeChatUsers()
  if (users.length === 0) return

  console.log(`[proactive] checking ${users.length} users`)

  for (const userId of users) {
    // 学习模式下不触发主动聊天
    if (isUserInLearningMode(userId)) {
      console.log(`[proactive] user ${userId} is in learning mode, skipping`)
      continue
    }
    if (!hasMinIntervalPassed(userId, config.minInterval)) continue
    const lastInteraction = getUserLastInteractionTime(userId)
    const weight = calculateTriggerWeight(lastInteraction)
    if (Math.random() < weight) {
      console.log(`[proactive] triggered for user ${userId} (weight: ${weight})`)
      await sendProactiveMessage(userId)
    }
  }
}

export function setProactiveBot(botInstance: WeChatBot): void {
  bot = botInstance
}

export function startProactiveChatService(intervalMinutes?: number): void {
  if (proactiveTimer) {
    console.log('[proactive] service already running')
    return
  }

  const config = getProactiveChatConfig()
  const interval = intervalMinutes || config.checkInterval

  console.log(`[proactive] starting proactive chat service (interval: ${interval}min)`)

  proactiveInitTimer = setTimeout(() => {
    proactiveInitTimer = null
    checkAndSendProactiveMessages()
  }, 30000)

  proactiveTimer = setInterval(checkAndSendProactiveMessages, interval * 60 * 1000)
}

export function stopProactiveChatService(): void {
  if (proactiveInitTimer) {
    clearTimeout(proactiveInitTimer)
    proactiveInitTimer = null
  }
  if (proactiveTimer) {
    clearInterval(proactiveTimer)
    proactiveTimer = null
  }
  bot = null
  console.log('[proactive] service stopped')
}

export async function triggerProactiveCheck(): Promise<{ success: boolean; sent: number }> {
  const config = getProactiveChatConfig()
  if (!config.enabled) return { success: true, sent: 0 }
  if (isQuietHours(config)) {
    console.log('[proactive] in quiet hours, skipping')
    return { success: true, sent: 0 }
  }

  const users = getWeChatUsers()
  let sentCount = 0

  for (const userId of users) {
    if (!hasMinIntervalPassed(userId, config.minInterval)) continue
    const lastInteraction = getUserLastInteractionTime(userId)
    const weight = calculateTriggerWeight(lastInteraction)
    if (weight > 0) {
      const sent = await sendProactiveMessage(userId)
      if (sent) sentCount++
    }
  }

  return { success: true, sent: sentCount }
}

export function getProactiveChatStatus(): {
  running: boolean
  config: ProactiveChatConfig
  isQuietHours: boolean
} {
  const config = getProactiveChatConfig()
  return {
    running: proactiveTimer !== null,
    config,
    isQuietHours: isQuietHours(config)
  }
}

/** Rebuild the timer when check_interval changes at runtime. */
export function updateProactiveChatConfig(updates: Partial<ProactiveChatConfig>): void {
  if (updates.checkInterval !== undefined && proactiveTimer) {
    clearInterval(proactiveTimer)
    proactiveTimer = setInterval(
      checkAndSendProactiveMessages,
      updates.checkInterval * 60 * 1000
    )
    console.log(`[proactive] timer rebuilt with interval: ${updates.checkInterval}min`)
  }
}
