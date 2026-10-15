import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 区域越界判定的 seam：什么时候算"到家"、什么时候只是路过或者边界抖动。
 *
 * 纯函数为主（不碰网络、不碰数据库）；最后一条走真实加工链路，确认状态真的落库、能跨进程续上。
 */
vi.mock('../database/index.js', async () => await import('./helpers/test-db.js'))

import { connectDatabase } from '../database/index.js'
import {
  emptyRegionState,
  reduceRegions,
  type RegionDef,
  type RegionPoint
} from '../services/phone/region-tracker.js'
import { ingestAndProcessLocations } from '../services/phone/track.service.js'

const HOME: RegionDef = { id: 1, name: '家', lat: 31.86, lon: 117.16, radiusM: 200 }
const OFFICE: RegionDef = { id: 2, name: '公司', lat: 31.87, lon: 117.17, radiusM: 200 }

const BASE = Date.parse('2026-10-15T10:00:00Z')
/** 第 min 分钟的点；默认落在"家"里 */
function p(min: number, opts: { inside?: boolean; accuracy?: number; lat?: number; lon?: number } = {}): RegionPoint {
  const { inside = true, accuracy = 10 } = opts
  return {
    recordedAt: new Date(BASE + min * 60_000).toISOString(),
    // "家"外：往东挪 1 公里，远超 200 米半径
    lat: opts.lat ?? HOME.lat,
    lon: opts.lon ?? (inside ? HOME.lon : HOME.lon + 0.011),
    accuracy
  }
}

const reduce = (points: RegionPoint[], regions: RegionDef[] = [HOME]) =>
  reduceRegions(emptyRegionState(), regions, points)

beforeEach(() => {
  const db = connectDatabase()
  db.prepare('DELETE FROM phone_locations').run()
  db.prepare('DELETE FROM phone_stays').run()
  db.prepare('DELETE FROM phone_trips').run()
  db.prepare('DELETE FROM phone_places').run()
  db.prepare('DELETE FROM phone_track_state').run()
})

describe('到达区域要待够 2 分钟', () => {
  it('在外待着 → 进家 1 分钟 → 不满 2 分钟不算到达', () => {
    const { transitions } = reduce([p(0, { inside: false }), p(1), p(2)])

    expect(transitions).toEqual([])
  })

  it('进家满 2 分钟才算，且事件时刻是"进门那一刻"而不是"确认那一刻"', () => {
    const { transitions } = reduce([p(0, { inside: false }), p(1), p(3)])

    expect(transitions).toHaveLength(1)
    expect(transitions[0]).toMatchObject({ regionId: 1, regionName: '家', inside: true })
    expect(transitions[0].at).toBe(p(1).recordedAt) // 10:01 进门，10:03 确认
  })

  it('满 2 分钟后不再重复报（持续在家只报一次）', () => {
    const { transitions } = reduce([p(0, { inside: false }), p(1), p(3), p(4), p(9)])

    expect(transitions).toHaveLength(1)
  })

  it('离开是对称的：出门满 2 分钟才报离开', () => {
    const { transitions } = reduce([p(0, { inside: false }), p(1), p(3), p(4, { inside: false }), p(7, { inside: false })])

    expect(transitions.map(t => t.inside)).toEqual([true, false])
    expect(transitions[1].at).toBe(p(4).recordedAt)
  })
})

describe('边界抖动不算到达', () => {
  it('刚进家又出去：趋势被推翻，不报到达', () => {
    const { transitions } = reduce([p(0, { inside: false }), p(1), p(2), p(3, { inside: false }), p(4, { inside: false })])

    expect(transitions).toEqual([])
  })

  it('趋势被推翻后重新计时要从头算（不吃上一次的便宜）', () => {
    // 10:01 进家（趋势）→ 10:02 出去（推翻）→ 10:30 进家（新趋势）→ 10:31 还不满 2 分钟
    const { transitions } = reduce([p(0, { inside: false }), p(1), p(2, { inside: false }), p(30), p(31)])

    expect(transitions).toEqual([])

    // 直到 10:33 才满 2 分钟，事件时刻是 10:30
    const { transitions: later } = reduce([p(0, { inside: false }), p(1), p(2, { inside: false }), p(30), p(31), p(33)])
    expect(later).toHaveLength(1)
    expect(later[0].at).toBe(p(30).recordedAt)
  })
})

describe('功能上线时你就在家，不该收到"到家了"', () => {
  it('第一次看到你在家只是静默记住，不发事件', () => {
    const { state, transitions } = reduce([p(0), p(1), p(5)])

    expect(transitions).toEqual([])
    expect(state['1'].inside).toBe(true)
  })

  it('静默确立之后正常离开仍会报', () => {
    const { transitions } = reduce([p(0), p(1, { inside: false }), p(5, { inside: false })])

    expect(transitions).toHaveLength(1)
    expect(transitions[0].inside).toBe(false)
  })
})

describe('定位精度差也要认得出在家', () => {
  it('室内 68 米误差、站在离圆心 150 米处，仍算在家（半径 100 米时）', () => {
    const tight: RegionDef = { ...HOME, radiusM: 100 }
    const spot = { lat: HOME.lat, lon: HOME.lon + 150 / (111320 * Math.cos((31.86 * Math.PI) / 180)) }

    const coarse = reduce([p(0, { inside: false }), p(1, { ...spot, accuracy: 68 }), p(3, { ...spot, accuracy: 68 })], [tight])
    expect(coarse.transitions).toHaveLength(1)

    // 同样的位置但精度很好 → 确实是出去了（报的是离开，不是到达）
    const precise = reduce([p(0), p(1, { ...spot, accuracy: 5 }), p(3, { ...spot, accuracy: 5 })], [tight])
    expect(precise.transitions.map(t => t.inside)).toEqual([false])
  })
})

describe('杂项', () => {
  it('多个区域各判各的（到家不影响公司）', () => {
    const { state, transitions } = reduce([p(0, { inside: false }), p(1), p(3)], [HOME, OFFICE])

    expect(transitions.map(t => t.regionId)).toEqual([1])
    expect(state['1'].inside).toBe(true)
    expect(state['2'].inside).toBe(false) // 公司只是静默确立"在外"
  })

  it('不改传入的状态（调用方失败时要能保留旧状态）', () => {
    const before = reduce([p(0, { inside: false }), p(1)])
    const snapshot = JSON.stringify(before.state)
    reduceRegions(before.state, [HOME], [p(3), p(4)])

    expect(JSON.stringify(before.state)).toBe(snapshot)
  })

  it('重复/乱序上报的点忽略，不搅乱计时', () => {
    const points = [p(0, { inside: false }), p(1), p(3)]
    const first = reduce(points)
    const again = reduceRegions(first.state, [HOME], points) // 同样三个点再来一遍

    expect(first.transitions).toHaveLength(1)
    expect(again.transitions).toEqual([])
  })

  it('没有区域时什么也不做', () => {
    expect(reduce([p(0), p(1)], []).transitions).toEqual([])
  })
})

describe('接进加工链路', () => {
  it('收点后区域判定跟着跑，状态落库（重跑同一批点不会重复报）', () => {
    const db = connectDatabase()
    db.prepare("INSERT INTO phone_places (device_id, center_lat, center_lon, radius_m, name, hit_count, day_count) VALUES ('dev-r', ?, ?, 200, '家', 1, 1)")
      .run(HOME.lat, HOME.lon)

    const points = (spec: Array<[number, boolean]>) => spec.map(([m, inside]) => ({
      recorded_at: new Date(BASE + m * 60_000).toISOString(),
      latitude: HOME.lat,
      longitude: inside ? HOME.lon : HOME.lon + 0.011,
      accuracy: 10,
      source: 'gps'
    }))

    const spec: Array<[number, boolean]> = [[0, false], [1, true], [3, true]]
    const first = ingestAndProcessLocations(points(spec), { deviceId: 'dev-r' })
    expect(first.regionTransitions.map(t => t.regionName)).toEqual(['家'])

    // 状态落库了：同样的点再来一遍不会二次发事件
    const second = ingestAndProcessLocations(points(spec), { deviceId: 'dev-r' })
    expect(second.regionTransitions).toEqual([])
  })
})
