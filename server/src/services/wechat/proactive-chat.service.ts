import { getSettingValue, setSetting } from '../settings.service.js'
import { addMessageToHistory, getLastMessageTime, getMessageHistory, isUserInLearningMode } from './ilink-bot.service.js'
import { DEFAULT_PROACTIVE_USER_MESSAGE } from '../prompt-defaults.js'
import { formatBeijingTime, getBeijingHour } from '../../utils/time.js'
import { getWeChatUsers, getUserLastActiveTime } from './users.service.js'
import { isJobRunning, restartJob, type SubsystemJob } from './scheduler.js'
import { runAgentTurn, wechatTaskAgentId, type AgentTurnRequest } from '../ai/agent-turn.js'
import { buildSystemPrompt } from '../ai/prompt.js'
import { getILinkModel } from './model.js'
import { getLastSentAt, isDeliveryReady, markSentAt, sendToUser } from './delivery.js'
import type { ChatMessage } from '../ai/pi-ai.adapter.js'

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

/** 上一条主动消息的发送时间（由 delivery 持久化）；从未发过返回 null。 */
function getLastProactiveSentAt(userId: string): number | null {
  return getLastSentAt('proactive', userId)
}

/** 连续未回复的主动搭话次数（持久化在 settings，随发送累加、随你回话归零）。 */
function getUserUnrepliedProactiveCount(userId: string): number {
  return getSettingValue<number>(`ilink_proactive_unreplied_${userId}`, 0)
}

function setUserUnrepliedProactiveCount(userId: string, count: number): void {
  setSetting(`ilink_proactive_unreplied_${userId}`, count)
}

/**
 * 连续未回复次数：用户在上次主动搭话之后说过话 → 归零（退避解除）；否则沿用累计值。
 * 从未主动搭话过也算 0。
 */
export function resolveUnrepliedCount(input: {
  lastUserMessageAtMs: number | null
  lastProactiveSentAtMs: number | null
  storedCount: number
}): number {
  if (input.lastProactiveSentAtMs === null) return 0
  const replied = input.lastUserMessageAtMs !== null && input.lastUserMessageAtMs > input.lastProactiveSentAtMs
  return replied ? 0 : input.storedCount
}

/**
 * 触发概率：按「距最后一条消息」多久分档（每 2 分钟掷一次）。
 *
 * 不足 45 分钟的那一段由最小间隔硬闸拦住，走不到这里，因此第一档从 45 分钟起算。
 */
export function proactiveSendProbability(minutesSinceLastMessage: number): number {
  if (minutesSinceLastMessage < 60) return 0.1
  if (minutesSinceLastMessage < 120) return 0.3
  if (minutesSinceLastMessage < 240) return 0.5
  if (minutesSinceLastMessage < 480) return 0.7
  return 0.9
}

/**
 * 未回复退避：连续未被回复 n 次后，概率乘以 3⁻ⁿ。
 *
 * 没有硬截止——退避自己会把它压到接近静默（n=5 约每 9 小时才可能再试一次，
 * n=8 则约十天一次），因此不需要额外加「当天上限」或「永久停掉」。
 */
export function proactiveBackoffFactor(unrepliedCount: number): number {
  return 3 ** -Math.max(unrepliedCount, 0)
}

/**
 * 这一轮要不要主动搭话。
 *
 * 抽成纯函数是为了两件事：（一）每种分支都能单独验；（二）你问「刚才为什么发了 / 为什么没发」
 * 时能给出一个确定的原因，而不是只能答「掷骰子」。
 * 基准是「对话里最后一条消息」（双方都算）——你说一句、它回一句、它搭话一句，都会重置最小间隔的钟。
 */
export function decideProactiveSend(input: {
  nowMs: number
  lastMessageAtMs: number | null
  unrepliedCount: number
  minIntervalMinutes: number
  roll: number
}): { send: boolean; probability: number; reason: 'ok' | 'no-message-yet' | 'min-interval' | 'not-lucky' } {
  if (input.lastMessageAtMs === null) return { send: false, probability: 0, reason: 'no-message-yet' }
  const minutes = (input.nowMs - input.lastMessageAtMs) / 60000
  if (minutes < input.minIntervalMinutes) return { send: false, probability: 0, reason: 'min-interval' }
  const probability = proactiveSendProbability(minutes) * proactiveBackoffFactor(input.unrepliedCount)
  return input.roll < probability
    ? { send: true, probability, reason: 'ok' }
    : { send: false, probability, reason: 'not-lucky' }
}

/**
 * 主动聊天这一轮要发出去的内容。
 *
 * 与 bot 对话同构：共享回合接缝、动态加载工具、多轮工具调用——**并且带同一份聊天历史**。
 * 以前不带历史（只有系统提示词 + 触发指令），于是它每次都得靠 `search_memory` 去捞
 * 才知遒最近聊过什么；带的代价是它会把上一轮的内容当真上下文，而那正是想要的。
 * 独立 agent id 避免污染 bot 的对话上下文（`ephemeral` 保证每次从 DB 历史重建）。
 */
export async function buildProactiveTurn(userId: string): Promise<AgentTurnRequest> {
  // 人设 + 工具指引 + 技能由 ai/prompt.ts 统一拼装
  const systemPrompt = await buildSystemPrompt({ kind: 'proactive' })
  // 触发指令，附加北京时间戳
  const userMessage = getSettingValue<string>('ilink_proactive_chat_user_message', DEFAULT_PROACTIVE_USER_MESSAGE)
  return {
    agentId: wechatTaskAgentId('proactive', userId),
    systemPrompt,
    userContent: `${formatBeijingTime()} ${userMessage}`,
    history: () => getMessageHistory(userId) as ChatMessage[],
    memoryUserId: userId,
    ephemeral: true,
    ...getILinkModel(),
  }
}

async function generateProactiveMessage(userId: string): Promise<string> {
  try {
    const content = await runAgentTurn(await buildProactiveTurn(userId))
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

    // 连续未回复次数：你在上次搭话后说过话就归零（退避解除）
    const unrepliedCount = resolveUnrepliedCount({
      lastUserMessageAtMs: getUserLastActiveTime(userId),
      lastProactiveSentAtMs: getLastProactiveSentAt(userId),
      storedCount: getUserUnrepliedProactiveCount(userId)
    })

    const decision = decideProactiveSend({
      nowMs: Date.now(),
      lastMessageAtMs: getLastMessageTime(userId),
      unrepliedCount,
      minIntervalMinutes: config.minInterval,
      roll: Math.random()
    })
    if (!decision.send) {
      console.log(`[proactive] skip ${userId}: ${decision.reason}`)
      continue
    }

    console.log(`[proactive] triggered for ${userId} (p=${decision.probability.toFixed(3)}, unreplied=${unrepliedCount})`)
    const sent = await sendProactiveMessage(userId)
    // 只有真送出去了才累计退避次数（没送达不算「没回复」）
    if (sent) setUserUnrepliedProactiveCount(userId, unrepliedCount + 1)
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
