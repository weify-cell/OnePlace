import { beforeEach, describe, expect, it, vi } from 'vitest'

// 真库 + 真迁移（031 段表、032 地点与事件表）
vi.mock('../database/index.js', async () => {
  const { connectDatabase } = await import('./helpers/test-db.js')
  return { connectDatabase }
})

import { connectDatabase } from '../database/index.js'
import { getBeijingDate } from '../utils/time.js'
import { ingestAndProcessLocations, listStays, processNewLocations } from '../services/phone/track.service.js'
import { PLACE_MATCH_RADIUS_M, isFrequentPlace, listPlaces } from '../services/phone/place.service.js'
import { listUnconsumedEvents, listEvents, consumeEvents } from '../services/phone/event.service.js'
import { getBuiltinToolMap } from '../services/ai/builtin-tools.js'

const DEVICE = 'device-places'
const BASE = { lat: 31.86, lon: 117.28 }
const mToLat = (m: number): number => m / 111320

let seq = 0

/**
 * 在（北京第 dayOffset 天 09:00 + 第 seq 段）× 北向 northM 米处待满 11 分钟，
 * 末尾再放一个 200 m 外的点把这段停留"顶"闭合（200 m 不足以构成行程）。
 */
function stayAt(dayOffset: number, northM: number): ReturnType<typeof rawPoint>[] {
  const baseMs = Date.parse(`${getBeijingDate()}T01:00:00.000Z`) + dayOffset * 86400000 + seq * 3600000
  seq++
  const mk = (i: number, extraM: number) => rawPoint(baseMs + i * 30000, northM + extraM)
  const inner = Array.from({ length: 23 }, (_v, i) => mk(i, i % 2 === 0 ? 3 : -3))
  return inner.concat([mk(23, 200)])
}

function rawPoint(ms: number, northM: number) {
  return {
    device_id: DEVICE,
    recorded_at: new Date(ms).toISOString(),
    latitude: BASE.lat + mToLat(northM),
    longitude: BASE.lon
  }
}

function count(table: string): number {
  return (connectDatabase().prepare(`SELECT COUNT(*) c FROM ${table}`).get() as { c: number }).c
}

function resetTables(): void {
  const db = connectDatabase()
  for (const table of ['phone_locations', 'phone_stays', 'phone_trips', 'phone_track_state', 'phone_places', 'phone_events']) {
    db.prepare(`DELETE FROM ${table}`).run()
  }
}

beforeEach(() => {
  seq = 0
  resetTables()
})

describe('常去地点：把停留归到同一处', () => {
  it('同一处不同天的停留算同一个地点，次数与天数分别累加', () => {
    ingestAndProcessLocations([...stayAt(0, 0), ...stayAt(1, 30)])

    const places = listPlaces(DEVICE)
    expect(places).toHaveLength(1)
    expect(places[0].hit_count).toBe(2)
    expect(places[0].day_count).toBe(2)
    expect(listStays(DEVICE).every(s => s.place_id === places[0].id)).toBe(true)
  })

  it('超过匹配半径的停留算另一处地点', () => {
    ingestAndProcessLocations([...stayAt(0, 0), ...stayAt(0, PLACE_MATCH_RADIUS_M + 120)])

    expect(listPlaces(DEVICE)).toHaveLength(2)
  })

  it('同一天反复停留：命中次数涨、天数不涨', () => {
    ingestAndProcessLocations([...stayAt(0, 0), ...stayAt(0, 20), ...stayAt(0, 40)])

    const place = listPlaces(DEVICE)[0]
    expect(place.hit_count).toBe(3)
    expect(place.day_count).toBe(1)
    // 同一天去三次还称不上「常去」——正是这条门槛的用意
    expect(isFrequentPlace(place)).toBe(false)
  })

  it('三天各去一次才算常去', () => {
    ingestAndProcessLocations([...stayAt(0, 0), ...stayAt(1, 20), ...stayAt(2, 40)])

    const place = listPlaces(DEVICE)[0]
    expect(isFrequentPlace(place)).toBe(true)
  })
})

describe('轨迹事件', () => {
  it('停留闭合产生到达与离开，行程闭合产生行程结束，时刻用发生时刻', () => {
    ingestAndProcessLocations([...stayAt(0, 0)])

    const events = listEvents(DEVICE)
    const types = events.map(e => e.event_type)
    expect(types).toContain('arrive')
    expect(types).toContain('leave')

    const stay = listStays(DEVICE)[0]
    const arrive = events.find(e => e.event_type === 'arrive')!
    const leave = events.find(e => e.event_type === 'leave')!
    expect(arrive.occurred_at).toBe(stay.started_at)
    expect(leave.occurred_at).toBe(stay.ended_at)
    expect(arrive.place_id).toBe(stay.place_id)
    expect(arrive.consumed_at).toBeNull()
  })

  it('事件可被标记为已消费', () => {
    ingestAndProcessLocations([...stayAt(0, 0)])
    const before = listUnconsumedEvents(DEVICE)
    expect(before.length).toBeGreaterThan(0)

    consumeEvents(before.map(e => e.id))

    expect(listUnconsumedEvents(DEVICE)).toEqual([])
    expect(listEvents(DEVICE)).toHaveLength(before.length) // 只是标了消费时刻，没删
  })

  it('崩溃后重跑加工：段不重复、地点命中次数不重复累加、事件不重复', () => {
    ingestAndProcessLocations([...stayAt(0, 0)])
    const stays = count('phone_stays')
    const events = count('phone_events')
    const hits = listPlaces(DEVICE)[0].hit_count

    // 模拟"段已落表但状态没存下来"，逼加工把同一批段再走一遍
    connectDatabase().prepare('DELETE FROM phone_track_state').run()
    const replay = processNewLocations(DEVICE)

    expect(replay).toEqual({ stays: 0, trips: 0 })
    expect(count('phone_stays')).toBe(stays)
    expect(count('phone_events')).toBe(events)
    expect(listPlaces(DEVICE)[0].hit_count).toBe(hits)
  })
})

describe('对话里给地点命名', () => {
  async function runTool(name: string, params: Record<string, unknown>): Promise<string> {
    const tool = getBuiltinToolMap().get(name)!
    const res = await tool.execute('call-1', params)
    return (res as { content: Array<{ text: string }> }).content.map(c => c.text).join('\n')
  }

  it('不传编号时给最近一次停留的地点命名，之后轨迹里就用名字指代', async () => {
    ingestAndProcessLocations([...stayAt(0, 0)])

    const confirm = await runTool('name_place', { name: '家' })
    expect(confirm).toContain('已命名')
    expect(confirm).toContain('家')

    const history = await runTool('get_location_history', {})
    expect(history).toContain('家（#')
  })

  it('反复出现但未命名时，轨迹结果里给出命名提示', async () => {
    ingestAndProcessLocations([...stayAt(0, 0), ...stayAt(1, 20), ...stayAt(2, 40)])

    const history = await runTool('get_location_history', { days: 7 })

    expect(history).toContain('name_place')
  })

  it('编号不存在时明确说找不到，而不是悄悄失败', async () => {
    ingestAndProcessLocations([...stayAt(0, 0)])

    const text = await runTool('name_place', { name: '公司', place_id: 999999 })

    expect(text).toContain('没找到')
  })
})
