import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { WeChatBot } from '@wechatbot/wechatbot'
import { getSettingValue, setSetting } from '../settings.service.js'

/**
 * 微信投递接缝：发送、context_token 过期后的积压与补发、并发去重、上次投递时间。
 *
 * 此前四个子系统各造一套投递记账：提醒的 pendingReminders 内存队列 + 直接改写
 * bot 私有 token 文件、报告与记忆各自的 inflight 集合、主动聊天的「上次发送」对。
 * 同一个关切四种部分实现，谁也没包含谁；而且只有提醒这条路处理 token 过期，
 * 报告与主动聊天的消息在 token 过期时会静默丢失。
 *
 * 现在：bot 实例只由本模块持有（启动时注入一次），所有对外发送都走 sendToUser，
 * 过期策略、去重、积压持久化只在这里定义。
 */

/** 待发送队列的存储键（放在 settings 表，重启不丢）。 */
const pendingKey = (userId: string): string => `ilink_pending_${userId}`

/** 某通道上次成功投递时间的存储键（保持与历史键名一致，不丢已有数据）。 */
const lastSentKey = (channel: string, userId: string): string => `ilink_${channel}_last_sent_${userId}`

/** 积压上限：单用户最多保留多少条未送达消息 */
const MAX_PENDING = 20

interface PendingMessage {
  text: string
  at: number
}

let bot: WeChatBot | null = null

/** 注入（或清除）投递所用的 bot 实例。 */
export function setDeliveryBot(instance: WeChatBot | null): void {
  bot = instance
}

/** 投递层是否已就绪（bot 已注入）。 */
export function isDeliveryReady(): boolean {
  return bot !== null
}

function readPending(userId: string): PendingMessage[] {
  return getSettingValue<PendingMessage[]>(pendingKey(userId), [])
}

function writePending(userId: string, pending: PendingMessage[]): void {
  setSetting(pendingKey(userId), pending.slice(-MAX_PENDING))
}

/** iLink 的 context_token 过期错误（ret=-2）。 */
function isContextTokenExpired(err: unknown): boolean {
  const e = err as { code?: string; payload?: { ret?: number } }
  return e?.code === 'API_ERROR' && e?.payload?.ret === -2
}

/**
 * 清除 WeChatBot 落盘的过期 context_token。
 *
 * 这是本仓库唯一触碰第三方库私有状态文件的地方（该库未提供清理 API），
 * 集中在此以便日后替换实现；其他模块不再直接操作 ~/.wechatbot。
 */
async function clearStoredContextToken(userId: string): Promise<void> {
  const tokenFile = path.join(os.homedir(), '.wechatbot', 'context_tokens.json')
  const raw = await fs.readFile(tokenFile, 'utf8').catch(() => '{}')
  const tokens = JSON.parse(raw) as Record<string, unknown>
  delete tokens[userId]
  await fs.writeFile(tokenFile, JSON.stringify(tokens, null, 2) + '\n')
}

/** 入队积压消息；按内容去重，避免同一提醒被多个检查周期重复排队。 */
function enqueue(userId: string, text: string): void {
  const pending = readPending(userId)
  if (pending.some(p => p.text === text)) {
    console.log(`[delivery] ${userId} already has this message queued, skip`)
    return
  }
  pending.push({ text, at: Date.now() })
  writePending(userId, pending)
}

/**
 * 发送一条消息。
 * - 成功 → true
 * - context_token 过期 → 入队等待补发，返回 false（不算送达）
 * - 其他失败 → 抛出，由调用方决定重试
 */
export async function sendToUser(userId: string, text: string): Promise<boolean> {
  if (!bot) throw new Error('delivery bot not set')

  try {
    await bot.send(userId, text)
    return true
  } catch (err) {
    if (isContextTokenExpired(err)) {
      console.warn(`[delivery] context_token expired for ${userId}, queued for later delivery`)
      enqueue(userId, text)
      await clearStoredContextToken(userId).catch(clearErr =>
        console.error('[delivery] failed to clear context_token:', clearErr)
      )
      return false
    }
    throw err
  }
}

/** 用户重新发消息时补发积压（多条合并为一条）。返回补发条数，失败时保留队列。 */
export async function flushPending(userId: string): Promise<number> {
  const pending = readPending(userId)
  if (pending.length === 0 || !bot) return 0

  const combined = pending.map(p => p.text).join('\n\n---\n\n')
  try {
    await bot.send(userId, combined)
  } catch (err) {
    // 保留队列等待下次重试
    console.error(`[delivery] failed to flush pending for ${userId}:`, err)
    return 0
  }

  writePending(userId, [])
  console.log(`[delivery] flushed ${pending.length} pending message(s) to ${userId}`)
  return pending.length
}

/** 该用户是否有积压未送达的消息。 */
export function hasPending(userId: string): boolean {
  return readPending(userId).length > 0
}

/** 进行中的投递任务键（并发去重，纯内存：只关乎并发，不关乎持久化）。 */
const inflight = new Set<string>()

/**
 * 同一 key 并发去重：已有同 key 任务在跑时不执行并返回 undefined。
 * 替代各模块自建的 inflight 集合。
 */
export async function withInflight<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (inflight.has(key)) return undefined
  inflight.add(key)
  try {
    return await fn()
  } finally {
    inflight.delete(key)
  }
}

/** 某通道上次成功投递时间（毫秒时间戳）；从未投递返回 null。 */
export function getLastSentAt(channel: string, userId: string): number | null {
  const value = getSettingValue<number | null>(lastSentKey(channel, userId), null)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** 记录某通道的成功投递时间。 */
export function markSentAt(channel: string, userId: string, ts: number = Date.now()): void {
  setSetting(lastSentKey(channel, userId), ts)
}
