import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 地点反查的 seam：坐标转换是否正确、真实响应是否解析得对、查过/没查过是否分得清。
 *
 * HTTP 是系统边界，用注入的 fetcher 替身（不 mock 自家模块）；数据库给真库 + 真迁移。
 */
vi.mock('../database/index.js', async () => await import('./helpers/test-db.js'))

import { connectDatabase } from '../database/index.js'
import { getSettingValue } from '../services/settings.service.js'
import { haversineM } from '../services/phone/track-segmenter.js'
import { gcj02ToWgs84, outOfChina, wgs84ToGcj02 } from '../services/phone/geo-coords.js'
import {
  geocodePendingPlaces,
  knownDistricts,
  parseAmapRegeo,
  placeLabel,
  toPlaceGeo,
  type GeocodeResult
} from '../services/phone/geocode.service.js'

/** 实测那个点：WGS-84（手机给的）与高德返回的 GCJ-02 */
const WGS = { lat: 31.862827483, lon: 117.16209704 }

/**
 * 真实响应（2026-10-15 调高德拿到的），只保留地址与 3 个 POI，其余字段删掉以便阅读。
 * 值本身没有改动——用例要钉住的正是"真实响应长什么样"。
 */
const REAL_REGEO = {
  status: '1',
  info: 'OK',
  infocode: '10000',
  regeocode: {
    formatted_address: '安徽省合肥市蜀山区蜀山新产业园区博威香山丽舍(东门)',
    addressComponent: {
      city: '合肥市',
      province: '安徽省',
      adcode: '340104',
      district: '蜀山区',
      township: '蜀山新产业园区',
      citycode: '0551',
      country: '中国'
    },
    pois: [
      { name: '博威香山丽舍', distance: '104.046', type: '商务住宅;住宅区;住宅小区' },
      { name: '中国民生银行(合肥蜀峰路社区支行)', distance: '99.441', type: '金融保险服务;银行' },
      { name: '四季花海公园B区', distance: '276.916', type: '风景名胜;公园广场' }
    ]
  }
}

function seedPlace(lat: number, lon: number, name: string | null = null): number {
  const res = connectDatabase().prepare(
    'INSERT INTO phone_places (device_id, center_lat, center_lon, radius_m, name, hit_count, day_count) VALUES (?, ?, ?, ?, ?, 1, 1)'
  ).run('dev-geo', lat, lon, 80, name)
  return Number(res.lastInsertRowid)
}

beforeEach(() => {
  const db = connectDatabase()
  db.prepare('DELETE FROM phone_places').run()
  db.prepare("DELETE FROM settings WHERE key LIKE 'phone_place_geo_%' OR key = 'amap_key'").run()
})

describe('坐标转换：WGS-84 → GCJ-02', () => {
  it('境内会偏移数百米（实测合肥这个点偏 568 米）', () => {
    const gcj = wgs84ToGcj02(WGS.lat, WGS.lon)
    const offset = haversineM(WGS.lat, WGS.lon, gcj.lat, gcj.lon)

    expect(offset).toBeGreaterThan(400)
    expect(offset).toBeLessThan(800)
    // 高德实际返回的就是这个位置附近
    expect(haversineM(gcj.lat, gcj.lon, 31.860922, 117.167673)).toBeLessThan(20)
  })

  it('境外不偏移（GCJ-02 只在中国境内生效）', () => {
    expect(outOfChina(35.68, 139.76)).toBe(true)
    expect(wgs84ToGcj02(35.68, 139.76)).toEqual({ lat: 35.68, lon: 139.76 })
    expect(wgs84ToGcj02(WGS.lat, WGS.lon)).not.toEqual({ lat: WGS.lat, lon: WGS.lon })
  })
})

describe('解析高德响应', () => {
  it('真实响应：地址、区划、POI 都取到', () => {
    const parsed = parseAmapRegeo(REAL_REGEO)!
    expect(parsed.district).toBe('蜀山区')
    expect(parsed.adcode).toBe('340104')
    expect(parsed.township).toBe('蜀山新产业园区')
    expect(parsed.pois).toHaveLength(3)
    expect(parsed.pois[0].distanceM).toBeCloseTo(104.046, 2)
  })

  it('status != 1（key 无效/额度用尽）返回 null，而不是抛', () => {
    expect(parseAmapRegeo({ status: '0', info: 'INVALID_USER_KEY', infocode: '10001' })).toBeNull()
    expect(parseAmapRegeo({ status: '1' })).toBeNull()
    expect(parseAmapRegeo(null)).toBeNull()
  })

  it('地名取高德排序的第一个，而不是自己按距离排（实测教训）', () => {
    const geo = toPlaceGeo(WGS.lat, WGS.lon, parseAmapRegeo(REAL_REGEO)!, new Date('2026-10-15T14:00:00Z'))

    // 真实数据里银行只有 99 米、住宅小区 104 米；按距离排会得到银行，
    // 而高德把住宅小区排在前面——这才是"我到的地方"该有的名字
    expect(geo.poiName).toBe('博威香山丽舍')
    expect(geo.poiDistanceM).toBeCloseTo(104.046, 2)
    expect(geo.poiType).toContain('住宅')
    expect(geo.district).toBe('蜀山区')
    expect(geo.geocodedAt).toBe('2026-10-15T14:00:00.000Z')
    // 存的是转换后的 GCJ-02，便于事后核对偏移
    expect(haversineM(geo.gcjLat, geo.gcjLon, WGS.lat, WGS.lon)).toBeGreaterThan(400)
  })
})

describe('待办地点的反查', () => {
  const fake = (result: GeocodeResult) => async (): Promise<GeocodeResult> => result
  const parsed = parseAmapRegeo(REAL_REGEO)!

  it('只查没查过的：查完再跑不会重复调用', async () => {
    seedPlace(WGS.lat, WGS.lon)
    let calls = 0
    const fetcher = async (): Promise<GeocodeResult> => {
      calls++
      return parsed
    }

    const first = await geocodePendingPlaces(fetcher)
    const second = await geocodePendingPlaces(fetcher)

    expect(first.geocoded).toBe(1)
    expect(first.pending).toBe(0)
    expect(second.geocoded).toBe(0)
    expect(calls).toBe(1)
  })

  it('失败不写缓存，下一轮会重试（网络抖一下不该把地点永久钉成"未命名"）', async () => {
    seedPlace(WGS.lat, WGS.lon)
    const failing = async (): Promise<GeocodeResult> => {
      throw new Error('网络超时')
    }

    const failed = await geocodePendingPlaces(failing)
    expect(failed.failed).toBe(1)
    expect(failed.pending).toBe(1)

    const retried = await geocodePendingPlaces(fake(parsed))
    expect(retried.geocoded).toBe(1)
    expect(retried.pending).toBe(0)
  })

  it('一个地点失败不影响其它地点', async () => {
    let call = 0
    seedPlace(WGS.lat, WGS.lon)
    seedPlace(WGS.lat + 0.01, WGS.lon + 0.01)
    const flaky = async (): Promise<GeocodeResult> => {
      call++
      if (call === 1) throw new Error('第一次失败')
      return parsed
    }

    const res = await geocodePendingPlaces(flaky)

    expect(res).toMatchObject({ geocoded: 1, failed: 1, pending: 1 })
  })

  it('没配 key 时不炸，只是记失败', async () => {
    seedPlace(WGS.lat, WGS.lon)
    // 不注入 fetcher → 走真实实现，此时 settings 里没有 amap_key
    const res = await geocodePendingPlaces()
    expect(res.failed).toBe(1)
    expect(res.geocoded).toBe(0)
  })
})

describe('人话标签的优先级', () => {
  it('手工名 > POI 名 > 地址 > 未命名', async () => {
    const id = seedPlace(WGS.lat, WGS.lon, '家')
    expect(placeLabel(id, '家')).toBe('家')
    // 即便机器也查到了名字，手工名依然优先
    await geocodePendingPlaces(async () => parseAmapRegeo(REAL_REGEO)!)
    expect(placeLabel(id, '家')).toBe('家')
    expect(placeLabel(id, null)).toContain('蜀山区')
  })

  it('没查过就老实说是未命名，不编', () => {
    const id = seedPlace(WGS.lat, WGS.lon)
    expect(placeLabel(id)).toBe(`未命名地点 #${id}`)
  })

  it('能列出已查地点涉及哪些区（为"我最近去过哪些区"打底）', async () => {
    seedPlace(WGS.lat, WGS.lon)
    await geocodePendingPlaces(async () => parseAmapRegeo(REAL_REGEO)!)

    expect(knownDistricts()).toEqual(['蜀山区'])
  })
})

describe('机器人读到的轨迹结论', () => {
  it('工具输出里用的是查到的地名与区划，不再说"未命名地点"', async () => {
    const { getBeijingDayWindow, getBeijingDate } = await import('../utils/time.js')
    const { getBuiltinToolMap } = await import('../services/ai/builtin-tools.js')

    const placeId = seedPlace(WGS.lat, WGS.lon)
    const win = getBeijingDayWindow(getBeijingDate())
    // 工具靠"最近有轨迹点的设备"定位设备，所以也要有一个原始点
    connectDatabase().prepare(
      'INSERT INTO phone_locations (device_id, recorded_at, latitude, longitude, accuracy, source) VALUES (?, ?, ?, ?, 8, ?)'
    ).run('dev-geo', win.start, WGS.lat, WGS.lon, 'gps')
    connectDatabase().prepare(`
      INSERT INTO phone_stays (device_id, started_at, ended_at, center_lat, center_lon, radius_m, sample_count, place_id)
      VALUES ('dev-geo', ?, ?, ?, ?, 85, 10, ?)
    `).run(win.start, new Date(Date.parse(win.start) + 25 * 60_000).toISOString(), WGS.lat, WGS.lon, placeId)
    await geocodePendingPlaces(async () => parseAmapRegeo(REAL_REGEO)!)

    const tool = getBuiltinToolMap().get('get_location_history')!
    const out = await tool.execute('t1', {})
    const text = (out as { content: Array<{ text: string }> }).content.map(c => c.text).join('\n')

    expect(text).toContain('博威香山丽舍')
    expect(text).toContain('蜀山区')
    expect(text).not.toContain('未命名地点')
  })
})

describe('反向转换：地图上点出来的坐标是 GCJ-02，存库前要转回 WGS-84', () => {
  it('来回一趟误差在 1 米内（否则人在地图上点的位置会被存歪）', () => {
    const gcj = wgs84ToGcj02(WGS.lat, WGS.lon)
    const back = gcj02ToWgs84(gcj.lat, gcj.lon)

    expect(haversineM(back.lat, back.lon, WGS.lat, WGS.lon)).toBeLessThan(1)
  })

  it('与正向转换相反：直接拿 GCJ-02 当 WGS-84 存会差几百米', () => {
    const gcj = wgs84ToGcj02(WGS.lat, WGS.lon)
    expect(haversineM(gcj.lat, gcj.lon, WGS.lat, WGS.lon)).toBeGreaterThan(400)

    const fixed = gcj02ToWgs84(gcj.lat, gcj.lon)
    expect(haversineM(fixed.lat, fixed.lon, WGS.lat, WGS.lon)).toBeLessThan(1)
  })

  it('境外原样返回', () => {
    expect(gcj02ToWgs84(35.68, 139.76)).toEqual({ lat: 35.68, lon: 139.76 })
  })
})

describe('界面拿到的坐标要能直接画在高德地图上', () => {
  it('列表里同时给出 WGS-84（真相）与 GCJ-02（画图用），两者相差数百米', async () => {
    const { listPlacesForUi } = await import('../services/phone/place.service.js')
    seedPlace(WGS.lat, WGS.lon)

    const [view] = listPlacesForUi('dev-geo')

    expect(view.centerLat).toBeCloseTo(WGS.lat, 6) // 存的是真相
    expect(haversineM(view.gcjLat, view.gcjLon, view.centerLat, view.centerLon)).toBeGreaterThan(400)
    // 与服务端查地名时用的是同一个转换结果
    expect(haversineM(view.gcjLat, view.gcjLon, 31.860922, 117.167673)).toBeLessThan(20)
  })

  it('从地图上点出来的坐标（GCJ-02）会被转成 WGS-84 再存', async () => {
    const { updatePlace } = await import('../services/phone/place.service.js')
    const id = seedPlace(WGS.lat, WGS.lon)
    const gcj = wgs84ToGcj02(32.5, 118.5)

    const updated = updatePlace(id, { lat: gcj.lat, lon: gcj.lon, coordSystem: 'gcj02' })

    // 存进去的必须是 WGS-84，否则"点了家"会变成把家画到 500 米外
    expect(haversineM(updated!.centerLat, updated!.centerLon, 32.5, 118.5)).toBeLessThan(1)
    expect(haversineM(updated!.gcjLat, updated!.gcjLon, gcj.lat, gcj.lon)).toBeLessThan(1)
  })

  it('不声明坐标系的调用（机器人、旧代码）仍按 WGS-84 处理', async () => {
    const { updatePlace } = await import('../services/phone/place.service.js')
    const id = seedPlace(WGS.lat, WGS.lon)

    const updated = updatePlace(id, { lat: 32.5, lon: 118.5 })

    expect(haversineM(updated!.centerLat, updated!.centerLon, 32.5, 118.5)).toBeLessThan(1)
  })
})
