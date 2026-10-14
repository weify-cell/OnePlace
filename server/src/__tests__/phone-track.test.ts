import { beforeEach, describe, expect, it, vi } from 'vitest'

// 真库 + 真迁移（031 已建 phone_stays / phone_trips / phone_track_state）
vi.mock('../database/index.js', async () => {
  const { connectDatabase } = await import('./helpers/test-db.js')
  return { connectDatabase }
})

import { connectDatabase } from '../database/index.js'
import { getBeijingDate } from '../utils/time.js'
import { ingestAndProcessLocations } from '../services/phone/track.service.js'
import { listStays, listTrips } from '../services/phone/track.service.js'
import { getBuiltinToolMap } from '../services/ai/builtin-tools.js'

const DEVICE = 'device-track'
const BASE = { lat: 31.86, lon: 117.28 }
const mToLat = (m: number): number => m / 111320
const mToLon = (m: number): number => m / (111320 * Math.cos((BASE.lat * Math.PI) / 180))

/** 当天北京 09:00 起，第 i 个点（间隔 seconds 秒，可带北向偏移） */
function point(i: number, seconds: number, northM = 0) {
  const baseMs = Date.parse(`${getBeijingDate()}T01:00:00.000Z`)
  return {
    device_id: DEVICE,
    recorded_at: new Date(baseMs + i * seconds * 1000).toISOString(),
    latitude: BASE.lat + mToLat(northM),
    longitude: BASE.lon
  }
}

/** 在一个地方待够 11 分钟（然后由后续点把这段闭合） */
function stayPoints(startIndex: number): ReturnType<typeof point>[] {
  return Array.from({ length: 23 }, (_v, i) => point(startIndex + i, 30, i % 2 === 0 ? 3 : -3))
}

/** 走 400 m（10 步、每步 40 m），再在终点待 11 分钟 */
function walkThenSettle(startIndex: number): ReturnType<typeof point>[] {
  const out = Array.from({ length: 10 }, (_v, i) => point(startIndex + i, 30, (i + 1) * 40))
  return out.concat(Array.from({ length: 23 }, (_v, i) => point(startIndex + 10 + i, 30, 400)))
}

function count(table: string): number {
  return (connectDatabase().prepare(`SELECT COUNT(*) c FROM ${table}`).get() as { c: number }).c
}

beforeEach(() => {
  const db = connectDatabase()
  db.prepare('DELETE FROM phone_locations').run()
  db.prepare('DELETE FROM phone_stays').run()
  db.prepare('DELETE FROM phone_trips').run()
  db.prepare('DELETE FROM phone_track_state').run()
})

describe('上报即加工（近实时）', () => {
  it('一次上报里包含停留与走动 → 停留与行程都落表', () => {
    const res = ingestAndProcessLocations([...stayPoints(0), ...walkThenSettle(25)])

    expect(res.accepted).toBeGreaterThan(0)
    expect(res.stays).toBeGreaterThanOrEqual(1)
    expect(res.trips).toBe(1)
    expect(count('phone_stays')).toBeGreaterThanOrEqual(1)
    expect(count('phone_trips')).toBe(1)

    const trip = listTrips(DEVICE)[0]
    expect(trip.distance_m).toBeGreaterThan(380)
    expect(trip.distance_m).toBeLessThan(420)
  })

  it('重复上报同一批点：既不新增轨迹点也不重复切分', () => {
    const points = [...stayPoints(0), ...walkThenSettle(25)]
    ingestAndProcessLocations(points)
    const staysAfterFirst = count('phone_stays')
    const tripsAfterFirst = count('phone_trips')

    const second = ingestAndProcessLocations(points)

    expect(second.accepted).toBe(0)
    expect(second.duplicate).toBe(points.length)
    expect(count('phone_stays')).toBe(staysAfterFirst)
    expect(count('phone_trips')).toBe(tripsAfterFirst)
  })

  it('分两批上报与一次上报结果一致（增量不改变结论）', () => {
    const points = [...stayPoints(0), ...walkThenSettle(25)]

    ingestAndProcessLocations(points)
    const whole = snapshot()

    resetTables()
    const half = Math.floor(points.length / 2)
    ingestAndProcessLocations(points.slice(0, half))
    ingestAndProcessLocations(points.slice(half))

    expect(snapshot()).toEqual(whole)
  })
})

/** 段的内容快照：不含自增 id（清表不重置 AUTOINCREMENT，id 本来就会变） */
function snapshot(): unknown {
  return {
    stays: listStays(DEVICE).map(({ id: _id, ...rest }) => rest),
    trips: listTrips(DEVICE).map(({ id: _id, ...rest }) => rest)
  }
}

function resetTables(): void {
  const db = connectDatabase()
  db.prepare('DELETE FROM phone_locations').run()
  db.prepare('DELETE FROM phone_stays').run()
  db.prepare('DELETE FROM phone_trips').run()
  db.prepare('DELETE FROM phone_track_state').run()
}

describe('按时间段读取', () => {
  it('时间范围左闭右开：范围外的段读不到', () => {
    ingestAndProcessLocations([...stayPoints(0), ...walkThenSettle(25)])

    const all = listStays(DEVICE)
    expect(all.length).toBeGreaterThanOrEqual(1)
    const first = all[0]

    const tooLate = listStays(DEVICE, { from: '2099-01-01T00:00:00.000Z' })
    expect(tooLate).toEqual([])

    const covering = listStays(DEVICE, { from: first.started_at, to: first.ended_at + 'Z' })
    expect(covering.map(s => s.id)).toContain(first.id)
  })
})

describe('机器人读轨迹的工具', () => {
  async function runTool(params: Record<string, unknown>): Promise<string> {
    const tool = getBuiltinToolMap().get('get_location_history')!
    const res = await tool.execute('call-1', params)
    return (res as { content: Array<{ text: string }> }).content.map(c => c.text).join('\n')
  }

  it('读出停留与行程的结论（含时刻、时长、里程、合计）', async () => {
    ingestAndProcessLocations([...stayPoints(0), ...walkThenSettle(25)])

    const text = await runTool({})

    expect(text).toContain('轨迹结论')
    expect(text).toContain('停留：')
    expect(text).toContain('行程：')
    expect(text).toContain('合计：停留')
    expect(text).toMatch(/\d{2}:\d{2}–\d{2}:\d{2}/) // 北京钟点区间
    expect(text).toMatch(/约 \d+\.\d km/)
  })

  it('该时间段没有数据时明确说明，而不是返回空字符串', async () => {
    ingestAndProcessLocations([...stayPoints(0), ...walkThenSettle(25)])

    const text = await runTool({ date: '2020-01-01' })

    expect(text).toContain('没有轨迹结论')
  })

  it('完全没有任何轨迹点时说明手机可能没在采集', async () => {
    const text = await runTool({})

    expect(text).toContain('还没有任何手机轨迹数据')
  })

  it('往前看多天时覆盖更早的段', async () => {
    ingestAndProcessLocations([...stayPoints(0), ...walkThenSettle(25)])

    const oneDay = await runTool({})
    const manyDays = await runTool({ days: 7 })

    expect(manyDays.length).toBeGreaterThanOrEqual(oneDay.length)
  })
})
