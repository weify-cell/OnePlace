import { getSettingValue } from '../settings.service.js'
import { addMessageToHistory, isUserInLearningMode } from './ilink-bot.service.js'
import { DEFAULT_PROACTIVE_SYSTEM_PROMPT, DEFAULT_PROACTIVE_USER_MESSAGE } from '../prompt-defaults.js'
import { formatBeijingTime, getBeijingHour } from '../../utils/time.js'
import { getWeChatUsers, getUserLastActiveTime } from './users.service.js'
import { isJobRunning, restartJob, type SubsystemJob } from './scheduler.js'
import { runAgentTurn } from '../ai/agent-turn.js'
import { buildSystemPrompt } from '../ai/prompt.js'
import { getILinkModel } from './model.js'
import { getLastSentAt, isDeliveryReady, markSentAt, sendToUser } from './delivery.js'

/**
 * 主动聊天子系统作业描述。
 * 间隔取自设置 `ilink_proactive_chat_check_interval`（每次启动/重建时读取），
 * 首次延迟 30 秒等 contextStore 就绪。
 */
export const proactiveChatJob: SubsystemJob = {
  name: 'proactive',
  run: checkAndSendProactiveMessages,
  intervalMinutes: () => getProactiveChatConfig().checkInterval,
  initDelayMs: 30_000,
}

interface ProactiveChatConfig {
  enabled: boolean
  minInterval: number
  quietHoursStart: number
  quietHoursEnd: number
  checkInterval: number
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

/** 上一條主动消息的发送时间（由 delivery 持久化）；从未发过返回 null。 */
function getLastProactiveSentAt(userId: string): number | null {
  return getLastSentAt('proactive', userId)
}

/**
 * 用户是否已回复上一条主动消息。
 * 没有主动消息记录视为"已回复"（可直接触发）；否则要求用户最近一条消息晚于上次主动发送时间。
 */
function hasUserRepliedSinceLastProactive(userId: string): boolean {
  const lastSent = getLastProactiveSentAt(userId)
  if (!lastSent) return true
  const lastUserMsg = getUserLastActiveTime(userId)
  return lastUserMsg !== null && lastUserMsg > lastSent
}

/** Read the user's last interaction time (user message or proactive send, whichever is later). */
function getUserLastInteractionTime(userId: string): number | null {
  const userMsgTime = getUserLastActiveTime(userId)
  const sentTime = getLastProactiveSentAt(userId)
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
  const lastSent = getLastProactiveSentAt(userId)
  if (!lastSent) return true
  return (Date.now() - lastSent) >= minIntervalMinutes * 60 * 1000
}

async function generateProactiveMessage(userId: string): Promise<string> {
  // 人设 + 工具指引 + 技能由 ai/prompt.ts 统一拼装
  const systemPrompt = await buildSystemPrompt({ kind: 'proactive' })

  // 触发指令，附加北京时间戳
  const userMessage = getSettingValue<string>('ilink_proactive_chat_user_message', DEFAULT_PROACTIVE_USER_MESSAGE)

  try {
    const timestamp = formatBeijingTime()
    // 走完整 agent loop（与 bot 同构：共享回合接缝、动态工具加载、多轮工具调用）
    // 独立 agent id 避免污染 bot 的对话上下文；ephemeral 保证每次从 DB 历史重建
    const content = await runAgentTurn({
      agentId: `proactive:${userId}`,
      systemPrompt,
      userContent: `${timestamp} ${userMessage}`,
      ephemeral: true,
      ...getILinkModel(),
    })
    return content || pickDefaultMessage()
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
  if (!isDeliveryReady()) {
    console.error('[proactive] delivery not ready')
    return false
  }

  try {
    const message = await generateProactiveMessage(userId)
    // token 过期时 sendToUser 会入队并返回 false（不算送达）
    const delivered = await sendToUser(userId, message)
    if (!delivered) return false

    // 共用 messageHistory：也写入触发指令，保证交替格式
    const timestamp = formatBeijingTime()
    const userMessage = getSettingValue<string>('ilink_proactive_chat_user_message', DEFAULT_PROACTIVE_USER_MESSAGE)
    addMessageToHistory(userId, 'user', `${timestamp} ${userMessage}`)
    addMessageToHistory(userId, 'assistant', message)
    markSentAt('proactive', userId)

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
    // 用户尚未回复上一条主动消息时，不发送新的主动消息
    if (!hasUserRepliedSinceLastProactive(userId)) {
      console.log(`[proactive] user ${userId} has not replied to last proactive message, skipping`)
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

export function getProactiveChatStatus(): {
  running: boolean
  config: ProactiveChatConfig
  isQuietHours: boolean
} {
  const config = getProactiveChatConfig()
  return {
    running: isJobRunning(proactiveChatJob.name),
    config,
    isQuietHours: isQuietHours(config)
  }
}

/** Rebuild the timer when check_interval changes at runtime. */
export function updateProactiveChatConfig(updates: Partial<ProactiveChatConfig>): void {
  if (updates.checkInterval !== undefined) {
    restartJob(proactiveChatJob.name)
  }
}
