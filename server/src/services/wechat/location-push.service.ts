import { getSettingValue, setSetting } from '../settings.service.js'
import { addMessageToHistory, getMessageHistory } from './ilink-bot.service.js'
import { getWeChatUsers } from './users.service.js'
import { getLastSentAt, isDeliveryReady, markSentAt, sendToUser } from './delivery.js'
import { type SubsystemJob } from './scheduler.js'
import { withInflight } from '../../utils/inflight.js'
import { resolveRecentDeviceId, getStay, getTrip } from '../phone/track.service.js'
import { consumeEvents, listUnconsumedEvents, type StoredEvent } from '../phone/event.service.js'
import { isFrequentPlace } from '../phone/place.service.js'
import { getBeijingDate, getBeijingHour, formatBeijingTime } from '../../utils/time.js'
import { buildSystemPrompt } from '../ai/prompt.js'
import { runAgentTurn, wechatAgentId, type AgentTurnRequest } from '../ai/agent-turn.js'
import type { ChatMessage } from '../ai/pi-ai.adapter.js'
import { getILinkModel } from './model.js'

/**
 * 轨迹事件推送：到家/离开/一段行程结束时，主动说一句有用的话。
 *
 * 这一层最容易变成骚扰，所以纪律写在前面：
 * - 静默时段（复用主动聊天的免打扰配置）只把事件留着「待发」，不外发；
 * - 事件发生超过 2 小时不再推送——「起床收到昨晚到家的提醒」比不提醒更糟；
 * - 同一事件只发一次（事件自带 consumed_at，重跑/重启都不会重复）；
 * - 每天有上限，超了就只入库不推送；
 * - **只有真送达才算发出**：token 过期入队（sendToUser 返回 false）时事件保持未消费，
 *   恢复后仍会补发。
 */

/** 事件超过这个时长就不再推送（只标记消费） */
export const EVENT_MAX_AGE_MS = 2 * 60 * 60 * 1000
/** 每日推送条数上限（默认） */
export const DEFAULT_MAX_PUSH_PER_DAY = 3
/** 模型可以选择"没什么好说的"，这时只消费事件、不打扰用户 */
const SKIP_TOKEN = 'SKIP'

const DEFAULT_PUSH_USER_MESSAGE = [
  '【手机轨迹事件】{events}',
  '请用一句自然的话跟用户说一声（像人一样，别罗列坐标或编号，别解释你是怎么知道的）。',
  `如果这件事没什么值得说的，只回复 ${SKIP_TOKEN}。`
].join('\n')

export interface LocationPushConfig {
  enabled: boolean
  maxPerDay: number
  quietHoursStart: number
  quietHoursEnd: number
  checkInterval: number
}

/** 免打扰时段直接复用主动聊天的配置：一处设置，两处生效。 */
export function getLocationPushConfig(): LocationPushConfig {
  return {
    enabled: getSettingValue<boolean>('ilink_phone_push_enabled', true),
    maxPerDay: getSettingValue<number>('ilink_phone_push_max_per_day', DEFAULT_MAX_PUSH_PER_DAY),
    quietHoursStart: getSettingValue<number>('ilink_proactive_chat_quiet_hours_start', 0),
    quietHoursEnd: getSettingValue<number>('ilink_proactive_chat_quiet_hours_end', 8),
    checkInterval: getSettingValue<number>('ilink_phone_push_check_interval', 5)
  }
}

function isQuietHours(config: LocationPushConfig, hour: number = getBeijingHour()): boolean {
  if (config.quietHoursStart <= config.quietHoursEnd) {
    return hour >= config.quietHoursStart && hour < config.quietHoursEnd
  }
  return hour >= config.quietHoursStart || hour < config.quietHoursEnd
}

export type EventPushDecision =
  | { action: 'send' }
  | { action: 'hold'; reason: 'quiet-hours' }
  | { action: 'drop'; reason: 'stale' | 'daily-cap' }

/**
 * 一条事件该不该发。
 *
 * 抽成纯函数是为了让「为什么没发」有确定答案（用户问起来能说清是静默时段、
 * 过期还是到上限），也为了让每种分支都能单独验。
 * 顺序有意：过期先判（静默时段里放旧的只会等成过期，不如直接丢），
 * 静默其次（事件还新鲜时留着，过了时段再发），上限最后。
 */
export function resolveEventPushDecision(input: {
  eventAgeMs: number
  quietHours: boolean
  sentToday: number
  maxPerDay: number
  maxAgeMs?: number
}): EventPushDecision {
  if (input.eventAgeMs > (input.maxAgeMs ?? EVENT_MAX_AGE_MS)) return { action: 'drop', reason: 'stale' }
  if (input.quietHours) return { action: 'hold', reason: 'quiet-hours' }
  if (input.sentToday >= input.maxPerDay) return { action: 'drop', reason: 'daily-cap' }
  return { action: 'send' }
}

/** 当日已推送条数（单个 settings 行，避免每天留一行垃圾）。 */
function getDailyPushCount(userId: string, date: string = getBeijingDate()): number {
  const stored = getSettingValue<{ date: string; count: number } | null>(`ilink_phone_push_count_${userId}`, null)
  return stored && stored.date === date ? stored.count : 0
}

function incrementDailyPushCount(userId: string, date: string = getBeijingDate()): void {
  setSetting(`ilink_phone_push_count_${userId}`, { date, count: getDailyPushCount(userId, date) + 1 })
}

/** 把事件说成人能看懂的一句（供模型改写，不喂原始坐标）。 */
export function describeEvent(deviceId: string, event: StoredEvent): string {
  const clock = (iso: string): string => new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(11, 16)

  if (event.target_kind === 'stay') {
    const stay = getStay(deviceId, event.target_id)
    if (!stay) return `在 ${clock(event.occurred_at)} 的停留`
    const minutes = Math.round((Date.parse(stay.ended_at) - Date.parse(stay.started_at)) / 60000)
    const where = stay.place_name
      ? stay.place_name
      : stay.place_hit_count !== null && stay.place_day_count !== null
        && isFrequentPlace({ hit_count: stay.place_hit_count, day_count: stay.place_day_count })
        ? '一个常去的地方（还没命名）'
        : '一个不常去的地方（还没命名）'
    return event.event_type === 'arrive'
      ? `${clock(event.occurred_at)} 到达「${where}」，到 ${clock(stay.ended_at)} 离开（停留 ${minutes} 分钟）`
      : `${clock(event.occurred_at)} 从「${where}」离开，此前停留 ${minutes} 分钟`
  }

  const trip = getTrip(deviceId, event.target_id)
  if (!trip) return `在 ${clock(event.occurred_at)} 结束的一段行程`
  const minutes = Math.round((Date.parse(trip.ended_at) - Date.parse(trip.started_at)) / 60000)
  return `${clock(trip.started_at)}–${clock(trip.ended_at)} 完成一段约 ${(trip.distance_m / 1000).toFixed(1)} km 的行程（${minutes} 分钟）`
}

/** 一轮推送的模型调用入口：LLM 是系统边界，测试可换掉而不必 mock 自家模块。 */
export type PushTurnRunner = (req: AgentTurnRequest) => Promise<string>

async function generatePushMessage(
  userId: string,
  events: StoredEvent[],
  deviceId: string,
  runTurn: PushTurnRunner
): Promise<string> {
  const template = getSettingValue<string>('ilink_phone_push_user_message', DEFAULT_PUSH_USER_MESSAGE)
  const systemPrompt = await buildSystemPrompt({ kind: 'proactive' })
  const content = await runTurn({
    // 与主对话共用同一个 agent：它主动说过的话，用户顺着回的那句就在同一个上下文里
    agentId: wechatAgentId(userId),
    systemPrompt,
    userContent: `${formatBeijingTime()} ${template.replace('{events}', events.map(e => describeEvent(deviceId, e)).join('\n'))}`,
    history: () => getMessageHistory(userId) as ChatMessage[],
    memoryUserId: userId,
    ...getILinkModel()
  })
  return content.trim()
}

/** 是否是「没什么好说的」：容忍模型多打一个句号。 */
export function isSkipReply(reply: string): boolean {
  return reply.trim().replace(/[。.!！]$/, '').toUpperCase() === SKIP_TOKEN
}

/**
 * 检查并推送未消费的轨迹事件。
 *
 * **一轮最多发一条**：一段轨迹闭合时会同时产生「到达/离开/行程结束」，
 * 逐事件发送会变成三条几乎同时到达的碎消息（"你到了家"紧跟"你离开了家"）。
 * 因此把本轮所有还新鲜的事件合成一条交给模型，它才能说出一句人话。
 * 时段、上限、时效仍按事件逐条判定：过期/超限的丢弃，静默时段的留着待发。
 *
 * 返回本次结果，便于测试与日志（真实调度只关心副作用）。
 */
export async function checkAndPushLocationEvents(opts?: {
  runTurn?: PushTurnRunner
  nowMs?: number
  hour?: number
}): Promise<{ sent: number; held: number; dropped: number; skipped: number }> {
  const config = getLocationPushConfig()
  if (!config.enabled) return { sent: 0, held: 0, dropped: 0, skipped: 0 }
  if (!isDeliveryReady()) return { sent: 0, held: 0, dropped: 0, skipped: 0 }

  const deviceId = resolveRecentDeviceId()
  if (!deviceId) return { sent: 0, held: 0, dropped: 0, skipped: 0 }

  const userId = getWeChatUsers()[0]
  if (!userId) return { sent: 0, held: 0, dropped: 0, skipped: 0 }

  const events = listUnconsumedEvents(deviceId, { limit: 10 })
  const result = { sent: 0, held: 0, dropped: 0, skipped: 0 }
  if (events.length === 0) return result

  const runTurn = opts?.runTurn ?? runAgentTurn
  const nowMs = opts?.nowMs ?? Date.now()
  const quiet = isQuietHours(config, opts?.hour)
  // 上限在**本轮开始时**判定一次：本轮中途发出去的不该让同一轮剩下的被算成超限
  const sentToday = getDailyPushCount(userId)

  const fresh: StoredEvent[] = []
  for (const event of events) {
    const decision = resolveEventPushDecision({
      eventAgeMs: nowMs - Date.parse(event.occurred_at),
      quietHours: quiet,
      sentToday,
      maxPerDay: config.maxPerDay
    })

    if (decision.action === 'hold') {
      result.held++
      continue
    }
    if (decision.action === 'drop') {
      consumeEvents([event.id])
      result.dropped++
      console.log(`[phone-push] dropped event ${event.id} (${decision.reason})`)
      continue
    }
    fresh.push(event)
  }

  if (fresh.length === 0) return result

  let message: string
  try {
    message = await generatePushMessage(userId, fresh, deviceId, runTurn)
  } catch (err) {
    // 生成失败不消费事件：下一轮还会再试
    console.error('[phone-push] failed to generate message:', err)
    result.held += fresh.length
    return result
  }

  if (!message || isSkipReply(message)) {
    consumeEvents(fresh.map(e => e.id))
    result.skipped += fresh.length
    console.log(`[phone-push] model skipped ${fresh.length} event(s)`)
    return result
  }

  // token 过期时 sendToUser 会入队并返回 false —— 不算送达，事件保持未消费，稍后补发
  const delivered = await sendToUser(userId, message).catch(err => {
    console.error('[phone-push] send failed:', err)
    return false
  })
  if (!delivered) {
    result.held += fresh.length
    return result
  }

  consumeEvents(fresh.map(e => e.id))
  incrementDailyPushCount(userId)
  addMessageToHistory(userId, 'assistant', message)
  markSentAt('phone_push', userId)
  result.sent++
  console.log(`[phone-push] sent ${fresh.length} event(s) to ${userId}: ${message.slice(0, 40)}...`)
  return result
}

/** 上次成功推送时间（调试/排查用）。 */
export function getLastPhonePushAt(userId: string): number | null {
  return getLastSentAt('phone_push', userId)
}

/**
 * 轨迹事件推送子系统作业描述。
 * 未注入 bot 时直接返回（delivery 未就绪说明机器人没在跑）。
 */
export const locationPushJob: SubsystemJob = {
  name: 'location-push',
  // 并发守卫在子系统这层（scheduler 只负责定时；同一 key 已在跑时本轮直接跳过）
  run: () => withInflight('phone-push', async () => {
    await checkAndPushLocationEvents()
  }),
  intervalMinutes: () => getLocationPushConfig().checkInterval,
  initDelayMs: 60_000
}
