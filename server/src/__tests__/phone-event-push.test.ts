import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 轨迹事件推送的 seam：一条事件该不该发、发出去之后系统知不知道自己发过了。
 *
 * 只 mock 系统边界：外部微信 SDK（共用替身）+ 数据库连接（真库、真迁移）。
 * 模型调用不 mock，而是**注入** runner——LLM 本来就是这条链路的外部输入。
 */
vi.mock('@wechatbot/wechatbot', async () => await import('./helpers/fake-wechat-sdk.js'))
vi.mock('../database/index.js', async () => await import('./helpers/test-db.js'))
import { isSkipReply } from '../services/ai/skip.js'

// 注意：这一行必须在其他 services 之前——模块图里存在环（见 .scratch/module-graph/issues/01），
// 从 location-push 侧先进会让 subsystems 的 const 还没初始化，读出来是 undefined
import { WECHAT_SUBSYSTEMS } from '../services/wechat/subsystems.js'
import { connectDatabase } from '../database/index.js'
import { WeChatBot, resetInstances } from './helpers/fake-wechat-sdk.js'
import { setDeliveryBot } from '../services/wechat/delivery.js'
import { saveWeChatUser } from '../services/wechat/users.service.js'
import {
  EVENT_MAX_AGE_MS,
  checkAndPushLocationEvents,
  resolveEventPushDecision
} from '../services/wechat/location-push.service.js'
import { ingestAndProcessLocations } from '../services/phone/track.service.js'
import { listUnconsumedEvents } from '../services/phone/event.service.js'
import { getSettingValue } from '../services/settings.service.js'
import type { AgentTurnRequest } from '../services/ai/agent-turn.js'
import { getBeijingDate } from '../utils/time.js'

const beijingToday = (): string => getBeijingDate()

const USER = 'o9cq80-push-user'
const DEVICE = 'device-push'
const BASE = { lat: 31.86, lon: 117.28 }
const mToLat = (m: number): number => m / 111320

let sent: string[]
let triggers: string[]
let seq = 0

function botWithSpy(): WeChatBot {
  const bot = new WeChatBot()
  bot.send = (async (_userId: string, text: string) => {
    sent.push(text)
  }) as never
  return bot
}

/**
 * 灌 `times` 段"停留 + 走去另一处停留"的轨迹，产生 arrive/leave/trip_end 事件。
 * 时间基准必须落在**时效窗口内**（事件超过 2 小时就不再推送），所以从 30 分钟前往前铺，
 * 并保证按 recorded_at 升序灌入。
 */
function seedTrack(times = 1): void {
  const points: Array<Record<string, unknown>> = []
  const baseMs = Date.now() - 30 * 60_000
  for (let t = times - 1; t >= 0; t--) {
    const start = baseMs - t * 45 * 60_000
    const mk = (i: number, northM: number) => ({
      device_id: DEVICE,
      recorded_at: new Date(start + i * 30000).toISOString(),
      latitude: BASE.lat + mToLat(northM),
      longitude: BASE.lon
    })
    // 第一处待 11 分钟
    for (let i = 0; i < 23; i++) points.push(mk(i, i % 2 === 0 ? 3 : -3))
    // 走 400 m（约 10 个点）到第二处，再待 11 分钟
    for (let i = 0; i < 10; i++) points.push(mk(23 + i, (i + 1) * 40))
    for (let i = 0; i < 23; i++) points.push(mk(33 + i, 400))
  }
  seq++
  ingestAndProcessLocations(points as never[])
}

const runTurn = async (req: AgentTurnRequest): Promise<string> => {
  triggers.push(req.userContent)
  return '到家啦，先歇会儿～'
}

beforeEach(() => {
  const db = connectDatabase()
  for (const table of ['phone_locations', 'phone_stays', 'phone_trips', 'phone_track_state', 'phone_places', 'phone_events', 'wechat_messages', 'settings']) {
    db.prepare(`DELETE FROM ${table}`).run()
  }
  sent = []
  triggers = []
  seq = 0
  resetInstances()
  setDeliveryBot(botWithSpy() as never)
  saveWeChatUser(USER)
})

describe('该不该发：决策是纯函数', () => {
  const base = { eventAgeMs: 60_000, quietHours: false, sentToday: 0, maxPerDay: 3 }

  it('新鲜事件、非静默、未超上限 → 发', () => {
    expect(resolveEventPushDecision(base)).toEqual({ action: 'send' })
  })

  it('静默时段 → 留着待发（不是丢弃）', () => {
    expect(resolveEventPushDecision({ ...base, quietHours: true })).toEqual({ action: 'hold', reason: 'quiet-hours' })
  })

  it('超过时效 → 丢弃，避免"起床收到昨晚到家"', () => {
    expect(resolveEventPushDecision({ ...base, eventAgeMs: EVENT_MAX_AGE_MS + 1 }))
      .toEqual({ action: 'drop', reason: 'stale' })
  })

  it('设了每日上限、且用满 → 只入库不推送', () => {
    expect(resolveEventPushDecision({ ...base, sentToday: 3 })).toEqual({ action: 'drop', reason: 'daily-cap' })
  })

  it('没设上限（null）→ 不限制，发过多少条都还能发', () => {
    expect(resolveEventPushDecision({ ...base, maxPerDay: null, sentToday: 99 })).toEqual({ action: 'send' })
  })

  it('上限设为 0 或负数 → 当作不限制（要停用请用开关，而不是把上限设成 0）', () => {
    expect(resolveEventPushDecision({ ...base, maxPerDay: 0, sentToday: 99 })).toEqual({ action: 'send' })
    expect(resolveEventPushDecision({ ...base, maxPerDay: -1, sentToday: 99 })).toEqual({ action: 'send' })
  })

  it('上限为 null 时，时效与静默照常生效（去掉的只是条数限制）', () => {
    expect(resolveEventPushDecision({ ...base, maxPerDay: null, quietHours: true }))
      .toEqual({ action: 'hold', reason: 'quiet-hours' })
    expect(resolveEventPushDecision({ ...base, maxPerDay: null, eventAgeMs: EVENT_MAX_AGE_MS + 1 }))
      .toEqual({ action: 'drop', reason: 'stale' })
  })

  it('过期优先于静默：静默时段里放旧事件只会等成过期，不如直接丢', () => {
    expect(resolveEventPushDecision({ ...base, quietHours: true, eventAgeMs: EVENT_MAX_AGE_MS + 1 }))
      .toEqual({ action: 'drop', reason: 'stale' })
  })
})

describe('推送这一轮', () => {
  it('有事件就发一条：触发内容说的是那件事，发完标记消费并写进对话历史', async () => {
    seedTrack()

    const res = await checkAndPushLocationEvents({ runTurn, hour: 12 })

    // 一段轨迹闭合出多个事件，但一轮只发一条（否则"到了家"和"离开了家"会同时到）
    expect(res.sent).toBe(1)
    expect(triggers).toHaveLength(1)
    expect(sent).toEqual(['到家啦，先歇会儿～'])
    expect(triggers[0]).toContain('到达')
    expect(triggers[0]).toContain('行程')
    // 触发内容不喂原始坐标，避免模型转述坐标
    expect(triggers[0]).not.toMatch(/\d{2}\.\d{4}/)

    // 一段轨迹会闭合出多个事件（到达/离开/行程结束），因此可能发多条；但都只写 assistant 行
    const rows = connectDatabase().prepare('SELECT role, content FROM wechat_messages ORDER BY id').all() as Array<{ role: string; content: string }>
    expect(rows.length).toBeGreaterThan(0)
    expect([...new Set(rows.map(r => r.role))]).toEqual(['assistant'])
    expect(rows[0].content).toBe('到家啦，先歇会儿～')

    // 已经发过的事件不再是"未消费"，因此不会重复发
    const second = await checkAndPushLocationEvents({ runTurn, hour: 12 })
    expect(second.sent).toBe(0)
    expect(sent).toHaveLength(1)
  })

  it('静默时段不外发，事件留在库里等过了时段', async () => {
    seedTrack()

    const res = await checkAndPushLocationEvents({ runTurn, hour: 3 })

    expect(res.sent).toBe(0)
    expect(res.held).toBeGreaterThan(0)
    expect(sent).toEqual([])
    expect(triggers).toEqual([])
    expect(listUnconsumedEvents(DEVICE).length).toBeGreaterThan(0)
  })

  it('过期事件不推送，只标记消费', async () => {
    seedTrack()
    // 把事件发生时刻挪到 3 小时前
    const stale = new Date(Date.now() - 3 * 3600_000).toISOString()
    connectDatabase().prepare('UPDATE phone_events SET occurred_at = ?').run(stale)

    const res = await checkAndPushLocationEvents({ runTurn, hour: 12 })

    expect(res.sent).toBe(0)
    expect(res.dropped).toBeGreaterThan(0)
    expect(sent).toEqual([])
    expect(listUnconsumedEvents(DEVICE)).toEqual([])
  })

  it('达到每日上限后只入库不推送', async () => {
    seedTrack()
    // 当天已经发过一条，上限也是 1
    connectDatabase().prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run('ilink_phone_push_max_per_day', '1')
    connectDatabase().prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run(`ilink_phone_push_count_${USER}`, JSON.stringify({ date: beijingToday(), count: 1 }))

    const res = await checkAndPushLocationEvents({ runTurn, hour: 12 })

    expect(res.sent).toBe(0)
    expect(res.dropped).toBeGreaterThan(0)
    expect(sent).toEqual([])
    expect(listUnconsumedEvents(DEVICE)).toEqual([])
  })

  it('没设上限时，当天已发过也照发（去掉额度后的实际行为）', async () => {
    seedTrack()
    connectDatabase().prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
      .run(`ilink_phone_push_count_${USER}`, JSON.stringify({ date: beijingToday(), count: 7 }))

    const res = await checkAndPushLocationEvents({ runTurn, hour: 12 })

    expect(res.sent).toBe(1)
    expect(sent).toHaveLength(1)
  })

  it('发出去之后计入当日额度（上限还在时才有意义，也留着做排查用）', async () => {
    seedTrack()

    await checkAndPushLocationEvents({ runTurn, hour: 12 })

    const counter = getSettingValue<{ date: string; count: number } | null>(`ilink_phone_push_count_${USER}`, null)
    expect(counter?.date).toBe(beijingToday())
    expect(counter?.count).toBe(1)
  })

  it('模型觉得没什么好说的就只消费事件，不打扰用户', async () => {
    seedTrack()

    const res = await checkAndPushLocationEvents({ runTurn: async () => 'SKIP', hour: 12 })

    expect(res.sent).toBe(0)
    expect(res.skipped).toBeGreaterThan(0)
    expect(sent).toEqual([])
    expect(listUnconsumedEvents(DEVICE)).toEqual([])
  })

  it('token 过期入队不算已发送：事件保持未消费，且不占当日额度', async () => {
    seedTrack()
    const failing = new WeChatBot()
    failing.send = (async () => {
      throw Object.assign(new Error('context token expired'), { code: 'API_ERROR', payload: { ret: -2 } })
    }) as never
    setDeliveryBot(failing as never)

    const res = await checkAndPushLocationEvents({ runTurn, hour: 12 })

    expect(res.sent).toBe(0)
    expect(res.held).toBeGreaterThan(0)
    expect(listUnconsumedEvents(DEVICE).length).toBeGreaterThan(0)
    // 积压里留着这条消息，等用户下次发消息时补发
    expect(getSettingValue<Array<{ text: string }>>(`ilink_pending_${USER}`, []).length).toBe(1)
    // 没送达就不该计入当日额度
    expect(getSettingValue<{ date: string; count: number } | null>(`ilink_phone_push_count_${USER}`, null)).toBeNull()
  })

  it('这条作业真的挂进了子系统清单（漏挂=静默失效）', () => {
    expect(WECHAT_SUBSYSTEMS.map(j => j.name)).toContain('location-push')
    expect(WECHAT_SUBSYSTEMS.find(j => j.name === 'location-push')?.initDelayMs).toBeGreaterThan(0)
  })

  it('SKIP 的判定容忍模型多打标点', () => {
    expect(isSkipReply('SKIP')).toBe(true)
    expect(isSkipReply(' skip。')).toBe(true)
    expect(isSkipReply('SKIPPING')).toBe(false)
  })
})
