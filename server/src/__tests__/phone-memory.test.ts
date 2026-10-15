import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 轨迹进入记忆的 seam：整理材料里有没有轨迹结论、提示词有没有说清怎么用。
 *
 * 只 mock 系统边界：数据库连接（真库、真迁移）。模型调用注入 runner——
 * 整理本来就把 LLM 当外部输入（MemoryTurnRunner），不必 mock 自家模块。
 */
vi.mock('../database/index.js', async () => await import('./helpers/test-db.js'))

import { connectDatabase } from '../database/index.js'
import { saveWeChatUser, setMemoryConsolidatedDate } from '../services/wechat/users.service.js'
import { consolidateDayMemory } from '../services/wechat/memory.service.js'
import { buildTrackSummary } from '../services/phone/track-summary.js'
import { ingestAndProcessLocations } from '../services/phone/track.service.js'
import { namePlace, listPlaces } from '../services/phone/place.service.js'
import { DEFAULT_MEMORY_SYSTEM_PROMPT } from '../services/prompt-defaults.js'
import { getBeijingDate } from '../utils/time.js'
import type { AgentTurnRequest } from '../services/ai/agent-turn.js'

const USER = 'o9cq80-memory-user'
const DEVICE = 'device-memory'
const BASE = { lat: 31.86, lon: 117.28 }
const mToLat = (m: number): number => m / 111320

let seq = 0

/** 当天北京 09:00 起：在某处待 11 分钟 → 走 400 m → 再待 11 分钟 */
function seedTrackDay(dayOffset = 0): void {
  const baseMs = Date.parse(`${getBeijingDate()}T01:00:00.000Z`) + dayOffset * 86400000 + seq * 6 * 3600_000
  seq++
  const points: Array<Record<string, unknown>> = []
  const mk = (i: number, northM: number) => ({
    device_id: DEVICE,
    recorded_at: new Date(baseMs + i * 30000).toISOString(),
    latitude: BASE.lat + mToLat(northM),
    longitude: BASE.lon
  })
  for (let i = 0; i < 23; i++) points.push(mk(i, i % 2 === 0 ? 3 : -3))
  for (let i = 0; i < 10; i++) points.push(mk(23 + i, (i + 1) * 40))
  for (let i = 0; i < 23; i++) points.push(mk(33 + i, 400))
  ingestAndProcessLocations(points as never[])
}

function seedChat(content: string): void {
  connectDatabase().prepare(`
    INSERT INTO wechat_messages (user_id, role, content, created_at)
    VALUES (?, 'user', ?, ?)
  `).run(USER, content, new Date().toISOString())
}

/** 捕获整理材料；返回一个"什么都没写"的 runner（本轮只关心输入） */
function captureRunner(): { runner: (req: AgentTurnRequest) => Promise<string>; contents: string[] } {
  const contents: string[] = []
  return {
    contents,
    runner: async (req: AgentTurnRequest) => {
      contents.push(req.userContent)
      return ''
    }
  }
}

beforeEach(() => {
  const db = connectDatabase()
  for (const table of ['phone_locations', 'phone_stays', 'phone_trips', 'phone_track_state', 'phone_places', 'phone_events', 'wechat_messages', 'wechat_memories', 'settings']) {
    db.prepare(`DELETE FROM ${table}`).run()
  }
  seq = 0
  saveWeChatUser(USER)
})

describe('轨迹摘要本身', () => {
  it('说清在哪待了多久、走了多远，且不含原始坐标', () => {
    seedTrackDay()
    const places = listPlaces(DEVICE)
    namePlace(places[0].id, '家')

    const summary = buildTrackSummary(DEVICE, getBeijingDate())

    expect(summary).toContain('停留')
    expect(summary).toContain('家')
    expect(summary).toContain('行程')
    expect(summary).toContain('km')
    // 坐标绝不进摘要：摘要要喂给模型，写了它就可能抄进记忆正文
    expect(summary).not.toMatch(/\d{2}\.\d{4}/)
  })

  it('当天没有轨迹就返回空串（不产出空标题）', () => {
    expect(buildTrackSummary(DEVICE, getBeijingDate())).toBe('')
  })
})

describe('整理时带上轨迹素材', () => {
  it('有对话也有轨迹：材料里同时有对话与轨迹摘要', async () => {
    seedChat('今天在家把方案写完了')
    seedTrackDay()
    const { runner, contents } = captureRunner()

    await consolidateDayMemory(USER, getBeijingDate(), runner)

    expect(contents).toHaveLength(1)
    expect(contents[0]).toContain('今天在家把方案写完了')
    expect(contents[0]).toContain('【手机轨迹摘要')
    expect(contents[0]).toContain('停留')
  })

  it('当天没聊天但有轨迹：仍然整理（出了门这件事本身可能就有值得记的规律）', async () => {
    seedTrackDay()
    const { runner, contents } = captureRunner()

    const res = await consolidateDayMemory(USER, getBeijingDate(), runner)

    expect(res.saved).toBe(0) // runner 没真写记忆，但确实被调用了
    expect(contents).toHaveLength(1)
    expect(contents[0]).toContain('【手机轨迹摘要')
  })

  it('既没聊天也没轨迹：不调用模型（避免白花钱）', async () => {
    const { runner, contents } = captureRunner()

    const res = await consolidateDayMemory(USER, getBeijingDate(), runner)

    expect(res.saved).toBe(0)
    expect(contents).toEqual([])
  })

  it('回归：摘要注入不会撑爆整理材料（只汇总，不逐点罗列）', async () => {
    seedChat('聊了两句')
    seedTrackDay()
    const { runner, contents } = captureRunner()

    await consolidateDayMemory(USER, getBeijingDate(), runner)

    const section = contents[0].split('【手机轨迹摘要（来自手机定位，不是对话内容）】')[1]
    expect(section.length).toBeLessThan(1200)
    // 一次停留一行、一段行程一行 + 合计
    expect(section.trim().split('\n').length).toBeLessThanOrEqual(4)
  })
})

describe('提示词里的轨迹规则', () => {
  it('说了要标明来源、不写坐标、不把单日流水写成记忆', () => {
    expect(DEFAULT_MEMORY_SYSTEM_PROMPT).toContain('来自手机轨迹')
    expect(DEFAULT_MEMORY_SYSTEM_PROMPT).toContain('不抽流水')
    expect(DEFAULT_MEMORY_SYSTEM_PROMPT).toContain('不要写坐标')
  })

  it('抽取依据从"只看对话"扩展为"对话 + 轨迹摘要"，避免规则互相矛盾', () => {
    expect(DEFAULT_MEMORY_SYSTEM_PROMPT).toContain('只基于对话内容与（如有）手机轨迹摘要抽取')
    expect(DEFAULT_MEMORY_SYSTEM_PROMPT).not.toContain('只基于对话内容抽取')
  })
})
