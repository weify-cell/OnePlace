import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 区域事件落地：越界判定 → 事件 → 推送 → 记忆，都走既有的那一条管道。
 *
 * 重点在**不重复打扰**：有名的地方只报"到家了"这类越界事件，不再报"在某某停留"；
 * 没名字的地方保持原来的低打扰行为。
 */
vi.mock('../database/index.js', async () => await import('./helpers/test-db.js'))

import { connectDatabase } from '../database/index.js'
import { ingestAndProcessLocations } from '../services/phone/track.service.js'
import { recordRegionEvents, listEvents, listUnconsumedEvents } from '../services/phone/event.service.js'
import { describeEvent } from '../services/wechat/location-push.service.js'

const DEVICE = 'dev-region-events'
const HOME = { lat: 31.86, lon: 117.16 }
const mToLat = (m: number): number => m / 111320

let seq = 0

/**
 * 在家待满 11 分钟（末尾一个 200 米外的点把停留闭合，不足以构成行程）。
 * `inside=false` 时挪到 250 米外：出了 150 米的区域，又不到 300 米，构不成行程。
 */
/** 只放一个点：不足以闭合任何段，但足以让区域判定确立"当前在外"（首次观测是静默的） */
function singlePointOutside() {
  const ms = Date.parse('2026-10-15T00:30:00.000Z') + seq * 3600000
  seq++
  return [{
    device_id: DEVICE,
    recorded_at: new Date(ms).toISOString(),
    latitude: HOME.lat,
    longitude: HOME.lon + 250 / (111320 * Math.cos((HOME.lat * Math.PI) / 180))
  }]
}

function stayAtHome(inside: boolean) {
  const baseMs = Date.parse('2026-10-15T01:00:00.000Z') + seq * 3600000
  seq++
  const lon = inside ? HOME.lon : HOME.lon + 250 / (111320 * Math.cos((HOME.lat * Math.PI) / 180))
  const mk = (i: number, extraM: number) => ({
    device_id: DEVICE,
    recorded_at: new Date(baseMs + i * 30000).toISOString(),
    latitude: HOME.lat + mToLat(i % 2 === 0 ? 3 : -3) + mToLat(extraM),
    longitude: lon
  })
  return Array.from({ length: 23 }, (_v, i) => mk(i, 0)).concat([mk(23, 200)])
}

function seedPlace(name: string | null = null, lat = HOME.lat, lon = HOME.lon): number {
  const res = connectDatabase().prepare(`
    INSERT INTO phone_places (device_id, center_lat, center_lon, radius_m, name, hit_count, day_count)
    VALUES (?, ?, ?, 150, ?, 3, 3)
  `).run(DEVICE, lat, lon, name)
  return Number(res.lastInsertRowid)
}

const events = () => listEvents(DEVICE)
const count = (table: string) =>
  (connectDatabase().prepare(`SELECT COUNT(*) c FROM ${table}`).get() as { c: number }).c

beforeEach(() => {
  seq = 0
  const db = connectDatabase()
  for (const table of ['phone_locations', 'phone_stays', 'phone_trips', 'phone_track_state', 'phone_places', 'phone_events']) {
    db.prepare(`DELETE FROM ${table}`).run()
  }
})

describe('区域事件写进同一张事件表', () => {
  it('越界判定出的到达/离开写成事件，指向区域本身', () => {
    const placeId = seedPlace('家')
    const at = '2026-10-15T09:00:00.000Z'

    const created = recordRegionEvents({
      deviceId: DEVICE,
      transitions: [
        { regionId: placeId, regionName: '家', inside: true, at },
        { regionId: placeId, regionName: '家', inside: false, at: '2026-10-15T18:00:00.000Z' }
      ]
    })

    expect(created).toBe(2)
    const [enter, exit] = events()
    expect(enter).toMatchObject({
      event_type: 'enter_region',
      target_kind: 'region',
      target_id: placeId,
      place_id: placeId,
      occurred_at: at
    })
    expect(exit.event_type).toBe('exit_region')
  })

  it('同一天第二次到家也是**独立一条**（旧唯一键会把它静默吞掉）', () => {
    const placeId = seedPlace('家')

    const created = recordRegionEvents({
      deviceId: DEVICE,
      transitions: [
        { regionId: placeId, regionName: '家', inside: true, at: '2026-10-15T09:00:00.000Z' },
        { regionId: placeId, regionName: '家', inside: true, at: '2026-10-15T18:30:00.000Z' }
      ]
    })

    expect(created).toBe(2)
    expect(events().map(e => e.occurred_at)).toEqual(['2026-10-15T09:00:00.000Z', '2026-10-15T18:30:00.000Z'])
  })

  it('崩溃重放：重算出的同一条事件不会被重复写入', () => {
    const placeId = seedPlace('家')
    const transitions = [{ regionId: placeId, regionName: '家', inside: true, at: '2026-10-15T09:00:00.000Z' }]

    expect(recordRegionEvents({ deviceId: DEVICE, transitions })).toBe(1)
    expect(recordRegionEvents({ deviceId: DEVICE, transitions })).toBe(0)
    expect(events()).toHaveLength(1)
  })

  it('区域事件会进入待推送队列（与停留事件共用同一条管道）', () => {
    const placeId = seedPlace('家')
    recordRegionEvents({
      deviceId: DEVICE,
      transitions: [{ regionId: placeId, regionName: '家', inside: true, at: '2026-10-15T09:00:00.000Z' }]
    })

    expect(listUnconsumedEvents(DEVICE).map(e => e.event_type)).toEqual(['enter_region'])
  })
})

describe('有名的地方只报越界，不报停留', () => {
  it('已划定的家：只出区域事件，不再出"到达/离开停留"', () => {
    const homeId = seedPlace('家')

    ingestAndProcessLocations(singlePointOutside()) // 先确立"在外"（静默）
    ingestAndProcessLocations(stayAtHome(true))     // 回家待 11 分钟 → 到家
    ingestAndProcessLocations(stayAtHome(false))    // 出门待 11 分钟 → 离家

    const types = events().map(e => `${e.target_kind}:${e.event_type}`)
    expect(types).toContain('region:enter_region')
    expect(types).toContain('region:exit_region')
    // 家是划定过的：这一处一次停留通知都不发
    // （"出门 250 米"那批点会形成另一处无名停留，它发停留通知是应有的行为）
    expect(events().filter(e => e.target_kind === 'stay' && e.place_id === homeId)).toEqual([])
  })

  it('没名字的地方：行为完全不变（仍然只报停留）', () => {
    seedPlace(null)

    ingestAndProcessLocations(stayAtHome(true))

    const types = events().map(e => `${e.target_kind}:${e.event_type}`)
    expect(types.filter(t => t.startsWith('region:'))).toEqual([])
    expect(types).toContain('stay:arrive')
    expect(types).toContain('stay:leave')
  })

  it('用户后来才给地点起名：那处旧停留事件保持不动，之后的越界照常报', () => {
    const placeId = seedPlace(null)
    ingestAndProcessLocations(stayAtHome(true))
    const stayEventsAtHome = () => events().filter(e => e.target_kind === 'stay' && e.place_id === placeId).length
    expect(stayEventsAtHome()).toBe(2) // 没名字时：到达 + 离开

    connectDatabase().prepare('UPDATE phone_places SET name = ? WHERE id = ?').run('家', placeId)
    ingestAndProcessLocations(singlePointOutside())
    ingestAndProcessLocations(stayAtHome(true))

    // 起名之后不再新增该处的停留事件；越界事件接上了
    expect(stayEventsAtHome()).toBe(2)
    expect(events().some(e => e.event_type === 'enter_region')).toBe(true)
  })
})

describe('推送文案', () => {
  it('到家/离家说的是人话，用划定的名字，不带坐标', () => {
    const placeId = seedPlace('家')
    recordRegionEvents({
      deviceId: DEVICE,
      transitions: [
        { regionId: placeId, regionName: '家', inside: true, at: '2026-10-14T14:20:00.000Z' },
        { regionId: placeId, regionName: '家', inside: false, at: '2026-10-15T00:10:00.000Z' }
      ]
    })
    const [enter, exit] = events()

    const enterText = describeEvent(DEVICE, enter)
    const exitText = describeEvent(DEVICE, exit)

    // 方向必须分得清：只说"到达"会让"离家"变成"到家"
    expect(enterText).toContain('到达')
    expect(enterText).toContain('22:20') // 北京时间钟点
    expect(exitText).toContain('离开')
    expect(exitText).toContain('08:10')
    expect(enterText).toContain('家')
    expect(exitText).toContain('家')
    expect(enterText).not.toBe(exitText)
    for (const text of [enterText, exitText]) {
      expect(text).not.toMatch(/\d{2}\.\d{4}/) // 不带经纬度
    }
  })

  it('区域还在（名字被清掉）时也不崩，只是说不出名字', () => {
    const placeId = seedPlace('家')
    recordRegionEvents({
      deviceId: DEVICE,
      transitions: [{ regionId: placeId, regionName: '家', inside: true, at: '2026-10-15T09:00:00.000Z' }]
    })
    connectDatabase().prepare('DELETE FROM phone_places WHERE id = ?').run(placeId)

    const [enter] = events()
    // 09:00 UTC = 北京 17:00；名字没了也不该崩，只是说不出地名
    expect(describeEvent(DEVICE, enter)).toContain('17:00')
    expect(describeEvent(DEVICE, enter)).toContain('划定的区域')
  })
})
