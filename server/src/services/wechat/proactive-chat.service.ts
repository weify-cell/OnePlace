import { getSettingValue, setSetting } from '../settings.service.js'
import { addMessageToHistory, getLastMessageTime, getMessageHistory, isUserInLearningMode } from './ilink-bot.service.js'
import { DEFAULT_PROACTIVE_USER_MESSAGE } from '../prompt-defaults.js'
import { formatBeijingTime, getBeijingHour } from '../../utils/time.js'
import { getWeChatUsers, getUserLastActiveTime } from './users.service.js'
import { isJobRunning, restartJob, type SubsystemJob } from './scheduler.js'
import { runAgentTurn, wechatAgentId, type AgentTurnRequest } from '../ai/agent-turn.js'
import { buildSystemPrompt } from '../ai/prompt.js'
import { getILinkModel } from './model.js'
import { getLastSentAt, isDeliveryReady, markSentAt, sendToUser } from './delivery.js'
import { decideReplyOutcome } from '../ai/skip.js'
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

/**
 * 跳过之后的冷却时长（分钟）默认值。
 *
 * 存在 settings（键 `ilink_proactive_skip_cooldown_minutes`）而不是写死：
 * 本仓库的约定是「所有配置存 settings 键值表」，调参走 SQL 或设置接口，
 * 不为了加一个设置项去改控制器与前端。
 */
export const DEFAULT_SKIP_COOLDOWN_MINUTES = 30

/**
 * 是不是还在「跳过」之后的冷却里。
 *
 * 刻意**不显式清除**冷却：条件是「刚跳过 **且** 你在那之后没说过话」——
 * 你一开口，前提就变了，冷却自动失效，不需要在各个入口挂清理钩子。
 */
export function skipCooldownActive(input: {
  nowMs: number
  lastSkipAtMs: number | null
  /** 该用户**自己**最后一次说话的时刻（不要传"任意消息"，机器人发的提醒/推送会混进来） */
  lastUserMessageAtMs: number | null
  cooldownMinutes: number
}): boolean {
  if (input.lastSkipAtMs === null) return false
  if (input.cooldownMinutes <= 0) return false
  if (input.nowMs - input.lastSkipAtMs >= input.cooldownMinutes * 60_000) return false
  const spokeSince = input.lastUserMessageAtMs !== null && input.lastUserMessageAtMs > input.lastSkipAtMs
  return !spokeSince
}

/** 上一次「模型决定不搭话」的时刻；从没跳过返回 null。 */
function getLastSkipAt(userId: string): number | null {
  return getSettingValue<number | null>(`ilink_proactive_skip_at_${userId}`, null)
}

function recordSkip(userId: string, atMs: number): void {
  setSetting(`ilink_proactive_skip_at_${userId}`, atMs)
}

/**
 * 冷却闸门：这一轮要不要因为「刚跳过」而不再征询。
 *
 * 用的是**用户自己**最后一次说话的时刻，不是「任意最后一条消息」——后者不分角色，
 * 机器人自己发的待办提醒、轨迹推送都会刷新它，那样冷却会被它自己的消息解除。
 */
export function proactiveSkipCooldownGate(userId: string, nowMs: number): boolean {
  const cooldownMinutes = getSettingValue<number>(
    'ilink_proactive_skip_cooldown_minutes',
    DEFAULT_SKIP_COOLDOWN_MINUTES
  )
  return skipCooldownActive({
    nowMs,
    lastSkipAtMs: getLastSkipAt(userId),
    lastUserMessageAtMs: getUserLastActiveTime(userId),
    cooldownMinutes
  })
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
 * 这条搭话是不是已经过时了（生成期间你又说了话）。
 * 两个时间点相同或更旧都算没过时；任一为空也不作废。
 */
export function nudgeIsStale(decidedForLastMessageAtMs: number | null, currentLastMessageAtMs: number | null): boolean {
  if (decidedForLastMessageAtMs === null || currentLastMessageAtMs === null) return false
  return currentLastMessageAtMs > decidedForLastMessageAtMs
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
    // 与主对话**共用同一个 agent**：它自己搭过的话、你顺着它回的话，都在同一个上下文里
    // （以前用独立的 ephemeral agent，导致"你回答它刚问的句话，它却不知道你在答什么"）
    agentId: wechatAgentId(userId),
    systemPrompt,
    userContent: `${formatBeijingTime()} ${userMessage}`,
    history: () => getMessageHistory(userId) as ChatMessage[],
    memoryUserId: userId,
    ...getILinkModel(),
  }
}

/**
 * 生成一条搭话内容。
 *
 * **不再兜底随机话**：以前生成失败或产出空文本时，会挑一句"在忙什么呢？"发出去，
 * 那正是"机器人突然插一句莫名其妙的话"的来源。现在没话说就不说（见 CONTEXT.md
 * 「跳过」「空文本」）——少说一句比说一句废话强。
 */
async function generateProactiveMessage(userId: string): Promise<string> {
  return runAgentTurn(await buildProactiveTurn(userId))
}

/** 一次搭话的结局。分开列是为了让"这次为什么没发"有确定答案。 */
export type ProactiveOutcome = 'sent' | 'skipped' | 'empty' | 'failed' | 'stale' | 'undelivered'

/**
 * 跑一次搭话并结账：发 / 跳过 / 空了 / 生成失败 / 过时 / 未送达。
 *
 * 生成器与发送器是注入的（位置推送的 `runTurn` 同款做法），所以这里能验**账目**，
 * 而不是模型的输出。三条纪律：
 * - 只有真发出去才算 `sent`（调用方据此推进未回复计数）
 * - **跳过**记冷却、不算未回复；**空文本**只是异常，不记冷却（它不是决定）
 * - 历史只在发送成功时写：没发出去就不该留痕，否则下次它以为自己搭过话
 */
export async function runProactiveTurn(input: {
  userId: string
  decidedForLastMessageAtMs: number | null
  /** 复查用的"当前最后一条消息"；省略则读真实历史（测试可注入） */
  currentLastMessageAtMs?: () => number | null
  generate: () => Promise<string>
  send: (text: string) => Promise<boolean>
}): Promise<ProactiveOutcome> {
  let content: string
  try {
    content = await input.generate()
  } catch (error) {
    console.error(`[proactive] failed to generate message for ${input.userId}:`, error)
    return 'failed'
  }

  // 发送前复查：生成要花几秒，这期间你完全可能又说话了。
  // 只要「最后一条消息」比判定时更新，就把这条作废——你开口了就不插话。
  const current = (input.currentLastMessageAtMs ?? (() => getLastMessageTime(input.userId)))()
  if (nudgeIsStale(input.decidedForLastMessageAtMs, current)) {
    console.log(`[proactive] dropped stale nudge for ${input.userId} (user spoke during generation)`)
    return 'stale'
  }

  // 判定顺序固定：先复查过时，再分流 skip / empty / send（同类判定只排一次序）
  const outcome = decideReplyOutcome(content)

  if (outcome === 'empty') {
    console.warn(`[proactive] 模型这一回合没产出内容，不发消息（user=${input.userId}）`)
    return 'empty'
  }

  if (outcome === 'skip') {
    recordSkip(input.userId, Date.now())
    console.log(`[proactive] skipped by model for ${input.userId}`)
    return 'skipped'
  }

  let delivered: boolean
  try {
    // token 过期时 sendToUser 会入队并返回 false（不算送达）；其它失败会抛
    delivered = await input.send(content)
  } catch (error) {
    // 异常必须在这里兜住：漏出去会冲断 checkAndSendProactiveMessages 的 for 循环，
    // 本轮后面所有用户都被跳过（delivery 的约定就是「其它失败→抛出」）
    console.error(`[proactive] failed to send message to ${input.userId}:`, error)
    return 'failed'
  }
  if (!delivered) return 'undelivered'

  // 共用 messageHistory：也写入触发指令，保证交替格式
  const timestamp = formatBeijingTime()
  const userMessage = getSettingValue<string>('ilink_proactive_chat_user_message', DEFAULT_PROACTIVE_USER_MESSAGE)
  addMessageToHistory(input.userId, 'user', `${timestamp} ${userMessage}`)
  addMessageToHistory(input.userId, 'assistant', content)
  markSentAt('proactive', input.userId)

  console.log(`[proactive] sent message to ${input.userId}: ${content.slice(0, 50)}...`)
  return 'sent'
}

/** Send a proactive message. Only writes history after successful send. */
async function sendProactiveMessage(userId: string, decidedForLastMessageAtMs: number | null): Promise<boolean> {
  if (!isDeliveryReady()) {
    console.error('[proactive] delivery not ready')
    return false
  }

  const outcome = await runProactiveTurn({
    userId,
    decidedForLastMessageAtMs,
    generate: () => generateProactiveMessage(userId),
    send: (text) => sendToUser(userId, text)
  })
  return outcome === 'sent'
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

    // 刚跳过且你之后没说话 → 冷却期内不再征询（每 5 分钟问一次、每次都被跳过纯属浪费）
    if (proactiveSkipCooldownGate(userId, Date.now())) {
      console.log(`[proactive] skip ${userId}: skip-cooldown`)
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

    const decidedForLastMessageAtMs = getLastMessageTime(userId)
    console.log(`[proactive] triggered for ${userId} (p=${decision.probability.toFixed(3)}, unreplied=${unrepliedCount})`)
    const sent = await sendProactiveMessage(userId, decidedForLastMessageAtMs)
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
