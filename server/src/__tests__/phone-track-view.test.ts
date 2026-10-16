import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 一天的轨迹回看：切天口径、画线用的点、断档、汇总。
 *
 * 这里最容易错的是**切天**：轨迹点是 UTC 存的，"一天"却是北京时间的一天，
 * 23:30 和次日 00:30 必须落在不同天里。
 */
vi.mock('../database/index.js', async () => await import('./helpers/test-db.js'))

import { connectDatabase } from '../database/index.js'
import { haversineM } from '../services/phone/track-segmenter.js'
import {
  GAP_MIN_MS,
  MAX_ACCURACY_FOR_PATH_M,
  getTrackDay,
  listTrackDays
} from '../services/phone/track-view.service.js'
import { recordRegionEvents } from '../services/phone/event.service.js'

const DEVICE = 'dev-view'

/** 北京时间的某一天某个钟点 → UTC ISO（北京时间 = UTC+8） */
function bj(day: string, hour: number, minute = 0): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hour - 8, minute)).toISOString()
}

function addPoint(at: string, lat = 31.86, lon = 117.16, accuracy: number | null = 10, device = DEVICE): void {
  connectDatabase().prepare(`
    INSERT INTO phone_locations (device_id, recorded_at, latitude, longitude, accuracy, source)
    VALUES (?, ?, ?, ?, ?, 'gps')
  `).run(device, at, lat, lon, accuracy)
}

function addStay(at: string, minutes: number, placeId: number | null, lat = 31.86, lon = 117.16): number {
  const started = bj(at, 0, 0)
  const endsAt = new Date(Date.parse(started) + minutes * 60_000).toISOString()
  const res = connectDatabase().prepare(`
    INSERT INTO phone_stays (device_id, started_at, ended_at, center_lat, center_lon, radius_m, sample_count, place_id)
    VALUES (?, ?, ?, ?, ?, 80, 10, ?)
  `).run(DEVICE, started, endsAt, lat, lon, placeId)
  return Number(res.lastInsertRowid)
}

function addTrip(startAt: string, minutes: number, distanceM: number): number {
  const started = bj(startAt, 0, 0)
  const endsAt = new Date(Date.parse(started) + minutes * 60_000).toISOString()
  const res = connectDatabase().prepare(`
    INSERT INTO phone_trips (device_id, started_at, ended_at, start_lat, start_lon, end_lat, end_lon, distance_m, sample_count)
    VALUES (?, ?, ?, 31.86, 117.16, 31.87, 117.17, ?, 20)
  `).run(DEVICE, started, endsAt, distanceM)
  return Number(res.lastInsertRowid)
}

function addPlace(name: string | null, lat = 31.86, lon = 117.16): number {
  const res = connectDatabase().prepare(`
    INSERT INTO phone_places (device_id, center_lat, center_lon, radius_m, name, hit_count, day_count)
    VALUES (?, ?, ?, 200, ?, 3, 2)
  `).run(DEVICE, lat, lon, name)
  return Number(res.lastInsertRowid)
}

beforeEach(() => {
  const db = connectDatabase()
  for (const table of ['phone_locations', 'phone_stays', 'phone_trips', 'phone_places']) {
    db.prepare(`DELETE FROM ${table}`).run()
  }
})

describe('按北京日期切天', () => {
  it('23:30 与次日 00:30 属于不同天（按 UTC 切会切错）', () => {
    addPoint(bj('2026-10-16', 23, 30))
    addPoint(bj('2026-10-17', 0, 30))

    expect(getTrackDay(DEVICE, '2026-10-16').points).toHaveLength(1)
    expect(getTrackDay(DEVICE, '2026-10-17').points).toHaveLength(1)
    // 16 号那天拿到的是 23:30 那个，不是 17 号凌晨那个
    expect(getTrackDay(DEVICE, '2026-10-16').points[0].at).toBe(bj('2026-10-16', 23, 30))
  })

  it('一天之内的点按时间升序', () => {
    addPoint(bj('2026-10-16', 15, 0))
    addPoint(bj('2026-10-16', 8, 0))
    addPoint(bj('2026-10-16', 12, 0))

    const hours = getTrackDay(DEVICE, '2026-10-16').points.map(p => p.at)
    expect(hours).toEqual([bj('2026-10-16', 8), bj('2026-10-16', 12), bj('2026-10-16', 15)])
  })

  it('有数据的日期列表倒序给出（用来标"哪天有数据"）', () => {
    addPoint(bj('2026-10-14', 10))
    addPoint(bj('2026-10-16', 10))
    addPoint(bj('2026-10-16', 18))

    expect(listTrackDays(DEVICE)).toEqual(['2026-10-16', '2026-10-14'])
  })
})

describe('画线用的点：低精度点丢掉，但要如实报数', () => {
  it('accuracy 超过 100 米的点不进折线，计数如实', () => {
    addPoint(bj('2026-10-16', 10, 0), 31.86, 117.16, 10)
    addPoint(bj('2026-10-16', 10, 1), 31.86, 117.16, MAX_ACCURACY_FOR_PATH_M + 1) // 室内漂移
    addPoint(bj('2026-10-16', 10, 2), 31.86, 117.16, 68) // 室内但还能用
    addPoint(bj('2026-10-16', 10, 3), 31.86, 117.16, null) // 没报精度：不能当坏点丢掉

    const day = getTrackDay(DEVICE, '2026-10-16')

    expect(day.points).toHaveLength(3)
    expect(day.droppedLowAccuracy).toBe(1)
    expect(day.totals.pointCount).toBe(4) // 总数如实
  })

  it('停留与行程的统计不受精度过滤影响（它们是切分器的产物）', () => {
    addStay('2026-10-16', 30, null)
    addTrip('2026-10-16', 20, 2400)
    addPoint(bj('2026-10-16', 10, 0), 31.86, 117.16, 999)

    const day = getTrackDay(DEVICE, '2026-10-16')

    expect(day.stays).toHaveLength(1)
    expect(day.trips).toHaveLength(1)
    expect(day.totals.distanceKm).toBeCloseTo(2.4, 1)
  })
})

describe('断档', () => {
  it('超过 15 分钟没有点 → 成一段断档，并给出起止时刻', () => {
    addPoint(bj('2026-10-16', 9, 0))
    addPoint(bj('2026-10-16', 9, 1))
    addPoint(bj('2026-10-16', 11, 0)) // 中间断了 119 分钟
    addPoint(bj('2026-10-16', 11, 1))

    const day = getTrackDay(DEVICE, '2026-10-16')

    expect(day.gaps).toHaveLength(1)
    expect(day.gaps[0]).toMatchObject({ from: bj('2026-10-16', 9, 1), to: bj('2026-10-16', 11, 0) })
    expect(day.gaps[0].minutes).toBe(119)
  })

  it('正常 60 秒间隔不算断档；刚好卡在阈值上也不算', () => {
    addPoint(bj('2026-10-16', 9, 0))
    addPoint(bj('2026-10-16', 9, 1))
    addPoint(bj('2026-10-16', 9, 2))
    const exactly = new Date(Date.parse(bj('2026-10-16', 9, 2)) + GAP_MIN_MS).toISOString()
    addPoint(exactly)

    expect(getTrackDay(DEVICE, '2026-10-16').gaps).toEqual([])
  })

  it('断档按**全部点**判断：被滤掉的那些低精度点也算"有数据"', () => {
    addPoint(bj('2026-10-16', 9, 0))
    addPoint(bj('2026-10-16', 9, 10), 31.86, 117.16, 999) // 低精度，不进折线
    addPoint(bj('2026-10-16', 9, 20))

    const day = getTrackDay(DEVICE, '2026-10-16')

    expect(day.gaps).toEqual([]) // 中间是有点的，不算没数据
    expect(day.points).toHaveLength(2)
  })
})

describe('坐标要给两套', () => {
  it('点带上 GCJ-02，且与 WGS-84 相差数百米（画地图用 GCJ）', () => {
    addPoint(bj('2026-10-16', 10, 0), 31.862827483, 117.16209704)

    const [point] = getTrackDay(DEVICE, '2026-10-16').points

    expect(point.lat).toBeCloseTo(31.862827483, 6)
    expect(haversineM(point.lat, point.lon, point.gcjLat, point.gcjLon)).toBeGreaterThan(400)
  })

  it('停留与行程的起点终点也给两套坐标', () => {
    addStay('2026-10-16', 30, null, 31.862827483, 117.16209704)
    addTrip('2026-10-16', 20, 2400)

    const day = getTrackDay(DEVICE, '2026-10-16')

    expect(haversineM(day.stays[0].lat, day.stays[0].lon, day.stays[0].gcjLat, day.stays[0].gcjLon)).toBeGreaterThan(400)
    expect(haversineM(day.trips[0].startLat, day.trips[0].startLon, day.trips[0].gcjStartLat, day.trips[0].gcjStartLon)).toBeGreaterThan(400)
  })
})

describe('汇总', () => {
  it('按地点分停留时长：有名用名字，没名字归"未命名"', () => {
    const homeId = addPlace('家')
    addStay('2026-10-16', 480, homeId, 31.86, 117.16)
    const officeId = addPlace('公司', 31.87, 117.17)
    addStay('2026-10-16', 460, officeId, 31.87, 117.17)
    addStay('2026-10-16', 45, null, 31.9, 117.9)

    const day = getTrackDay(DEVICE, '2026-10-16')
    const byPlace = Object.fromEntries(day.totals.byPlace.map(p => [p.name ?? '未命名', p.minutes]))

    expect(byPlace).toEqual({ 家: 480, 公司: 460, 未命名: 45 })
    expect(day.totals.stayMinutes).toBe(985)
  })

  it('首末次定位时刻与里程合计', () => {
    addPoint(bj('2026-10-16', 8, 15))
    addPoint(bj('2026-10-16', 19, 40))
    addTrip('2026-10-16', 30, 14000)
    addTrip('2026-10-16', 20, 2000)

    const day = getTrackDay(DEVICE, '2026-10-16')

    expect(day.totals.firstFixAt).toBe(bj('2026-10-16', 8, 15))
    expect(day.totals.lastFixAt).toBe(bj('2026-10-16', 19, 40))
    expect(day.totals.distanceKm).toBeCloseTo(16, 1)
  })

  it('只带当天真去过的区域（没去的不画圈）', () => {
    const homeId = addPlace('家')
    addPlace('公司', 32.5, 118.5)
    addStay('2026-10-16', 60, homeId)
    addPoint(bj('2026-10-16', 10, 0))

    const day = getTrackDay(DEVICE, '2026-10-16')

    expect(day.places.map(p => p.name)).toEqual(['家'])
  })
})

describe('边界', () => {
  it('没有数据的那天返回空结构，而不是报错', () => {
    const day = getTrackDay(DEVICE, '2026-01-01')

    expect(day).toMatchObject({ date: '2026-01-01', points: [], stays: [], trips: [], gaps: [], droppedLowAccuracy: 0 })
    expect(day.totals).toMatchObject({ distanceKm: 0, stayMinutes: 0, pointCount: 0, firstFixAt: null, lastFixAt: null })
  })

  it('缺省日期 = 今天（北京时间）', async () => {
    const { getBeijingDate } = await import('../utils/time.js')
    expect(getTrackDay(DEVICE).date).toBe(getBeijingDate())
  })

  it('只取这台设备的点（别的设备不掺进来）', () => {
    addPoint(bj('2026-10-16', 10, 0))
    addPoint(bj('2026-10-16', 10, 1), 31.86, 117.16, 10, 'other-device')

    expect(getTrackDay(DEVICE, '2026-10-16').points).toHaveLength(1)
  })
})

describe('在某个区域待了多久：按区域事件算，不按停留段', () => {
  function addRegionEvent(placeId: number, inside: boolean, at: string): void {
    recordRegionEvents({
      deviceId: DEVICE,
      transitions: [{ regionId: placeId, regionName: 'x', inside, at }]
    })
  }

  it('园区的例子：停留段只认到 16 分钟，区域事件给出真实时长 3 小时 4 分', () => {
    const officeId = addPlace('公司', 31.87, 117.17)
    // 人在园区里走动，切分器只闭合出一小段停留
    addStay('2026-10-16', 16, officeId, 31.87, 117.17)
    // 但区域判定看的是"有没有越出圈"：08:09 进门、11:41 才离开
    addRegionEvent(officeId, true, bj('2026-10-16', 8, 9))
    addRegionEvent(officeId, false, bj('2026-10-16', 11, 41))

    const region = getTrackDay(DEVICE, '2026-10-16').totals.byRegion[0]

    expect(region.name).toBe('公司')
    expect(region.minutes).toBe(3 * 60 + 32)
    expect(region.ongoing).toBe(false)
  })

  it('当天开始时人就在区域里（凌晨没发生过"进入"）：从 00:00 算起', () => {
    const homeId = addPlace('家')
    // 只有一条"离开"：说明 00:00 时人已经在家里
    addRegionEvent(homeId, false, bj('2026-10-16', 7, 44))

    const region = getTrackDay(DEVICE, '2026-10-16').totals.byRegion[0]

    expect(region.minutes).toBe(7 * 60 + 44)
    expect(region.ongoing).toBe(false)
  })

  it('还没离开（进行中）：算到当天最后一个点，并标明进行中', () => {
    const homeId = addPlace('家')
    addRegionEvent(homeId, true, bj('2026-10-16', 20, 28))
    addPoint(bj('2026-10-16', 20, 49))

    const region = getTrackDay(DEVICE, '2026-10-16').totals.byRegion[0]

    expect(region.minutes).toBe(21)
    expect(region.ongoing).toBe(true)
    expect(region.since).toBe(bj('2026-10-16', 20, 28))
  })

  it('一天里进出多次会累加', () => {
    const homeId = addPlace('家')
    addRegionEvent(homeId, false, bj('2026-10-16', 7, 44))
    addRegionEvent(homeId, true, bj('2026-10-16', 19, 1))
    addRegionEvent(homeId, false, bj('2026-10-16', 19, 34))
    addRegionEvent(homeId, true, bj('2026-10-16', 20, 28))
    addPoint(bj('2026-10-16', 20, 49))

    const region = getTrackDay(DEVICE, '2026-10-16').totals.byRegion[0]

    // 00:00–07:44 + 19:01–19:34 + 20:28–20:49
    expect(region.minutes).toBe(464 + 33 + 21)
  })

  it('没划定的地点不算区域时长（停留段照旧列在时间轴里）', () => {
    addStay('2026-10-16', 45, null)
    addPoint(bj('2026-10-16', 12, 0))

    const day = getTrackDay(DEVICE, '2026-10-16')

    expect(day.totals.byRegion).toEqual([])
    expect(day.stays).toHaveLength(1)
  })
})
