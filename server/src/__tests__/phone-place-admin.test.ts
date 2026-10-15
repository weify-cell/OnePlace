import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 区域的读写 seam：人怎么"划定"一个地方。
 *
 * 画定范围 = 给地点一个名字 + 一个半径（`name` 非空就是区域，见 ADR-0004）。
 * 这里只测服务层（本仓库没有路由层测试的先例），HTTP 接线用真实请求验证。
 */
vi.mock('../database/index.js', async () => await import('./helpers/test-db.js'))

import { connectDatabase } from '../database/index.js'
import {
  createPlace,
  listPlacesForUi,
  listRegions,
  updatePlace
} from '../services/phone/place.service.js'
import { geocodePendingPlaces, placeLabel } from '../services/phone/geocode.service.js'
import { forgetPlaceGeo, savePlaceGeo } from '../services/phone/geocode.service.js'
import { WGS, REAL_REGEO, parseAmapRegeo } from './helpers/geo-fixtures.js'

const DEVICE = 'dev-admin'
const LAT = 31.86
const LON = 117.16

function seedPlace(lat = LAT, lon = LON, name: string | null = null): number {
  const res = connectDatabase().prepare(`
    INSERT INTO phone_places (device_id, center_lat, center_lon, radius_m, name, hit_count, day_count, last_seen_at)
    VALUES (?, ?, ?, 120, ?, 3, 2, '2026-10-15T10:00:00.000Z')
  `).run(DEVICE, lat, lon, name)
  return Number(res.lastInsertRowid)
}

const countPlaces = () =>
  (connectDatabase().prepare('SELECT COUNT(*) AS n FROM phone_places').get() as { n: number }).n

beforeEach(() => {
  const db = connectDatabase()
  db.prepare('DELETE FROM phone_places').run()
  db.prepare("DELETE FROM settings WHERE key LIKE 'phone_place_geo_%'").run()
})

describe('手工新建区域', () => {
  it('地图上点一下就能建：名字 + 位置（半径有默认值）', () => {
    const { place, merged } = createPlace({ deviceId: DEVICE, name: '公司', lat: LAT, lon: LON })

    expect(merged).toBe(false)
    expect(place.name).toBe('公司')
    expect(place.radiusM).toBeGreaterThan(0)
    expect(listRegions(DEVICE).map(r => r.name)).toEqual(['公司'])
  })

  it('画在已有地点附近 → 直接给它命名，不再建一个重复的', () => {
    const existing = seedPlace()
    // 相隔约 60 米，仍在同一处
    const { place, merged } = createPlace({ deviceId: DEVICE, name: '家', lat: LAT + 0.0005, lon: LON })

    expect(merged).toBe(true)
    expect(place.id).toBe(existing)
    expect(countPlaces()).toBe(1)
    expect(listRegions(DEVICE).map(r => r.name)).toEqual(['家'])
  })

  it('拒绝离谱的输入：名字空、半径超范围、坐标越界', () => {
    expect(() => createPlace({ deviceId: DEVICE, name: '   ', lat: LAT, lon: LON })).toThrow()
    expect(() => createPlace({ deviceId: DEVICE, name: '家', lat: LAT, lon: LON, radiusM: 0 })).toThrow()
    expect(() => createPlace({ deviceId: DEVICE, name: '家', lat: LAT, lon: LON, radiusM: 99999 })).toThrow()
    expect(() => createPlace({ deviceId: DEVICE, name: '家', lat: 999, lon: LON })).toThrow()
    expect(() => createPlace({ deviceId: DEVICE, name: 'x'.repeat(50), lat: LAT, lon: LON })).toThrow()
    expect(countPlaces()).toBe(0)
  })
})

describe('划定/取消区域', () => {
  it('给已有地点起名字 → 立刻成为区域（下一次收点就参与越界判定）', () => {
    const id = seedPlace()
    expect(listRegions(DEVICE)).toEqual([])

    const updated = updatePlace(id, { name: '家' })

    expect(updated?.name).toBe('家')
    expect(listRegions(DEVICE)).toEqual([{ id, name: '家', lat: LAT, lon: LON, radiusM: 120 }])
  })

  it('改半径与圆心（地图上拖圆、拉滑块）', () => {
    const id = seedPlace(LAT, LON, '家')
    const updated = updatePlace(id, { radiusM: 300, lat: LAT + 0.002, lon: LON + 0.001 })

    expect(updated?.radiusM).toBe(300)
    expect(updated?.centerLat).toBeCloseTo(LAT + 0.002, 6)
    // 名字没被这次改动洗掉
    expect(listRegions(DEVICE)[0].radiusM).toBe(300)
  })

  it('清空名字 = 取消区域（不再参与判定），地点本身留着', () => {
    const id = seedPlace(LAT, LON, '家')
    const updated = updatePlace(id, { name: '' })

    expect(updated?.name).toBeNull()
    expect(listRegions(DEVICE)).toEqual([])
    expect(countPlaces()).toBe(1)
  })

  it('不存在的编号返回 null，不抛', () => {
    expect(updatePlace(9999, { name: '家' })).toBeNull()
  })

  it('改名时同样校验', () => {
    const id = seedPlace()
    expect(() => updatePlace(id, { radiusM: -5 })).toThrow()
    expect(() => updatePlace(id, { name: 'x'.repeat(50) })).toThrow()
  })
})

describe('给界面看的列表', () => {
  it('带上名字、范围、命中次数与高德查到的地址（机器名不冒充区域名）', () => {
    const id = seedPlace()
    savePlaceGeo(id, {
      poiName: '博威香山丽舍',
      poiType: '商务住宅;住宅区;住宅小区',
      poiDistanceM: 104,
      address: '安徽省合肥市蜀山区蜀山新产业园区博威香山丽舍(东门)',
      province: '安徽省',
      city: '合肥市',
      district: '蜀山区',
      township: '蜀山新产业园区',
      adcode: '340104',
      gcjLat: 31.8609,
      gcjLon: 117.1677,
      geocodedAt: '2026-10-15T14:00:00.000Z'
    })

    const [view] = listPlacesForUi(DEVICE)

    expect(view.name).toBeNull() // 机器名不进 name
    expect(view.isRegion).toBe(false)
    expect(view.geo?.district).toBe('蜀山区')
    expect(view.geo?.poiName).toBe('博威香山丽舍')
    expect(view.hitCount).toBe(3)
    expect(view.centerLat).toBe(LAT)
  })

  it('常见地点排在前面（界面上先看到家/公司）', () => {
    seedPlace(LAT + 0.05, LON + 0.05)
    connectDatabase().prepare('UPDATE phone_places SET hit_count = 1, day_count = 1').run()
    seedPlace(LAT, LON, '家')

    expect(listPlacesForUi(DEVICE)[0].name).toBe('家')
  })

  it('没有地点时返回空数组', () => {
    expect(listPlacesForUi(DEVICE)).toEqual([])
  })
})

describe('挪了圈之后地址要重查', () => {
  it('忘掉缓存后，下一轮反查会按新坐标给出新地址', async () => {
    const id = seedPlace(WGS.lat, WGS.lon)
    await geocodePendingPlaces(async () => parseAmapRegeo(REAL_REGEO)!)
    expect(placeLabel(id)).toContain('蜀山区')

    // 人把圈挪到别处
    updatePlace(id, { lat: 32.5, lon: 118.5 })
    forgetPlaceGeo(id)
    expect(placeLabel(id)).toBe(`未命名地点 #${id}`)

    // 再查一次，拿到的是新地址（这里仍用同一份响应，验证的是"确实重新查了"）
    let calls = 0
    await geocodePendingPlaces(async () => {
      calls++
      return parseAmapRegeo(REAL_REGEO)!
    })
    expect(calls).toBe(1)
    expect(placeLabel(id)).toContain('蜀山区')
  })
})
