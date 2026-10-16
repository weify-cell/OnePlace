import { connectDatabase } from '../../database/index.js'
import { getBeijingDate, getBeijingDayWindow } from '../../utils/time.js'
import { listLocationPoints, type StoredLocationPoint } from './location.service.js'
import { listStays, listTrips, resolveRecentDeviceId, type StoredStay, type StoredTrip } from './track.service.js'
import { listEvents } from './event.service.js'
import { listRegions } from './place.service.js'
import type { RegionDef } from './region-tracker.js'
import { wgs84ToGcj02 } from './geo-coords.js'
import { haversineM } from './track-segmenter.js'

/**
 * 一天的轨迹回看：把原始点、停留、行程整理成"一页能看明白"的形状。
 *
 * 两条容易搞错的口径写在这里：
 * 1. **"一天"是北京时间的一天**。点是 UTC 存的，直接用 UTC 日期切会把晚上 8 点后的行程切到第二天。
 * 2. **画线与断档不是一回事**：折线要丢掉低精度点（室内 60 米的漂移会画成毛刺），
 *    断档却要按**全部点**判断（"真的有数据"和"能画得准"是两件事）。
 */

/** 折线用的点最多容忍多少米误差；更差的点会把路径画成锯齿 */
export const MAX_ACCURACY_FOR_PATH_M = 100

/** 相邻点超过这么久没有新点，就认为中间"没有定位数据" */
export const GAP_MIN_MS = 15 * 60 * 1000

export interface TrackPointView {
  at: string
  /** WGS-84（真相，手机上报的） */
  lat: number
  lon: number
  /** GCJ-02（画在高德地图上用这个，两者相差数百米） */
  gcjLat: number
  gcjLon: number
  accuracy: number | null
}

export interface TrackStayView {
  id: number
  startedAt: string
  endedAt: string
  minutes: number
  radiusM: number
  placeId: number | null
  name: string | null
  lat: number
  lon: number
  gcjLat: number
  gcjLon: number
}

export interface TrackTripView {
  id: number
  startedAt: string
  endedAt: string
  minutes: number
  distanceM: number
  startLat: number
  startLon: number
  endLat: number
  endLon: number
  gcjStartLat: number
  gcjStartLon: number
  gcjEndLat: number
  gcjEndLon: number
}

export interface TrackGapView {
  from: string
  to: string
  minutes: number
}

/**
 * 在某个划定区域里待了多久。
 *
 * **必须按区域事件算，不能按停留段**：停留段的判定是"100 米内待够 10 分钟"，
 * 公司是园区这种比 100 米大得多的地方，人一走就断了（实测一天只认出 16 分钟，
 * 而人其实待了 3 小时）。区域判定只看有没有越出圈，才是"我在这待了多久"的正确答案。
 */
export interface TrackRegionStay {
  placeId: number
  name: string
  minutes: number
  /** 到当天最后一个定位点为止还没离开 */
  ongoing: boolean
  since: string
  until: string
}

export interface TrackDayTotals {
  pointCount: number
  distanceKm: number
  stayMinutes: number
  firstFixAt: string | null
  lastFixAt: string | null
  /** 按地点分的停留**段**时长（切分器的产物；园区这类场所会低估） */
  byPlace: Array<{ placeId: number | null; name: string | null; minutes: number }>
  /** 各划定区域的真实时长（按越界事件算）——"我在家/公司待了多久"看这个 */
  byRegion: TrackRegionStay[]
}

export interface TrackDayView {
  date: string
  points: TrackPointView[]
  stays: TrackStayView[]
  trips: TrackTripView[]
  gaps: TrackGapView[]
  /** 被精度过滤挡在折线之外的点数——如实报出来，不偷偷丢 */
  droppedLowAccuracy: number
  /** 当天真去过的已划定区域（没去的不画圈） */
  places: RegionDef[]
  totals: TrackDayTotals
}

const minutesBetween = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / 60_000)

function toPointView(point: StoredLocationPoint): TrackPointView {
  const gcj = wgs84ToGcj02(point.latitude, point.longitude)
  return {
    at: point.recorded_at,
    lat: point.latitude,
    lon: point.longitude,
    gcjLat: gcj.lat,
    gcjLon: gcj.lon,
    accuracy: point.accuracy
  }
}

function toStayView(stay: StoredStay): TrackStayView {
  const gcj = wgs84ToGcj02(stay.center_lat, stay.center_lon)
  return {
    id: stay.id,
    startedAt: stay.started_at,
    endedAt: stay.ended_at,
    minutes: minutesBetween(stay.started_at, stay.ended_at),
    radiusM: stay.radius_m,
    placeId: stay.place_id,
    name: stay.place_name,
    lat: stay.center_lat,
    lon: stay.center_lon,
    gcjLat: gcj.lat,
    gcjLon: gcj.lon
  }
}

function toTripView(trip: StoredTrip): TrackTripView {
  const start = wgs84ToGcj02(trip.start_lat, trip.start_lon)
  const end = wgs84ToGcj02(trip.end_lat, trip.end_lon)
  return {
    id: trip.id,
    startedAt: trip.started_at,
    endedAt: trip.ended_at,
    minutes: minutesBetween(trip.started_at, trip.ended_at),
    distanceM: trip.distance_m,
    startLat: trip.start_lat,
    startLon: trip.start_lon,
    endLat: trip.end_lat,
    endLon: trip.end_lon,
    gcjStartLat: start.lat,
    gcjStartLon: start.lon,
    gcjEndLat: end.lat,
    gcjEndLon: end.lon
  }
}

/** 相邻点之间"没有定位数据"的时段。按全部点算，与精度过滤无关。 */
function findGaps(points: StoredLocationPoint[]): TrackGapView[] {
  const gaps: TrackGapView[] = []
  for (let i = 1; i < points.length; i++) {
    const ms = Date.parse(points[i].recorded_at) - Date.parse(points[i - 1].recorded_at)
    if (ms > GAP_MIN_MS) {
      gaps.push({
        from: points[i - 1].recorded_at,
        to: points[i].recorded_at,
        minutes: Math.round(ms / 60_000)
      })
    }
  }
  return gaps
}

/**
 * 各区域的时长：进入→离开成对配对；当天开始前就在里面（只看到一条"离开"）从 00:00 算；
 * 到最后还没离开（只看到"进入"）算到当天最后一个定位点并标"进行中"。
 */
function summarizeRegions(
  deviceId: string,
  window: { start: string; end: string },
  regions: RegionDef[],
  lastFixAt: string | null
): TrackRegionStay[] {
  if (regions.length === 0) return []
  const events = listEvents(deviceId, { from: window.start, to: window.end })
    .filter(event => event.target_kind === 'region')
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))
  const dayEnd = lastFixAt ?? window.start

  const result: TrackRegionStay[] = []
  for (const region of regions) {
    const own = events.filter(event => event.target_id === region.id)
    if (own.length === 0) continue

    let since: string | null = null
    let minutes = 0
    let ongoing = false
    let ongoingSince = ''

    for (const event of own) {
      if (event.event_type === 'enter_region') {
        if (since === null) since = event.occurred_at
        continue
      }
      // 离开：如果当天没见过"进入"，说明 00:00 时人就已经在里面了
      const from = since ?? window.start
      const parsed = Math.round((Date.parse(event.occurred_at) - Date.parse(from)) / 60_000)
      if (parsed > 0) minutes += parsed
      since = null
    }

    if (since !== null) {
      const until = Date.parse(dayEnd) > Date.parse(since) ? dayEnd : since
      const parsed = Math.round((Date.parse(until) - Date.parse(since)) / 60_000)
      if (parsed > 0) minutes += parsed
      ongoing = true
      ongoingSince = since
    }

    if (minutes > 0 || ongoing) {
      result.push({
        placeId: region.id,
        name: region.name,
        minutes,
        ongoing,
        since: ongoingSince || (own.length > 0 ? own[0].occurred_at : window.start),
        until: ongoing ? dayEnd : (own[own.length - 1].occurred_at)
      })
    }
  }

  return result.sort((a, b) => b.minutes - a.minutes)
}

function summarize(
  all: StoredLocationPoint[],
  pathPoints: TrackPointView[],
  stays: StoredStay[],
  trips: StoredTrip[]
): TrackDayTotals {
  const byPlaceMap = new Map<string, { placeId: number | null; name: string | null; minutes: number }>()
  let stayMinutes = 0
  for (const stay of stays) {
    const minutes = minutesBetween(stay.started_at, stay.ended_at)
    stayMinutes += minutes
    const key = stay.place_id === null ? 'none' : String(stay.place_id)
    const entry = byPlaceMap.get(key) ?? { placeId: stay.place_id, name: stay.place_name, minutes: 0 }
    entry.minutes += minutes
    byPlaceMap.set(key, entry)
  }

  return {
    pointCount: all.length,
    distanceKm: trips.reduce((sum, trip) => sum + trip.distance_m, 0) / 1000,
    stayMinutes,
    firstFixAt: all.length > 0 ? all[0].recorded_at : null,
    lastFixAt: all.length > 0 ? all[all.length - 1].recorded_at : null,
    // 待得久的排前面（家、公司一眼看到）
    byPlace: [...byPlaceMap.values()].sort((a, b) => b.minutes - a.minutes),
    byRegion: []
  }
}

/** 当天有点落在其中的区域（没去过的不画圈） */
function regionsVisited(regions: RegionDef[], points: StoredLocationPoint[]): RegionDef[] {
  // 注意：区域圆心与原始点都是 WGS-84，必须**同一套坐标系**比较。
  // 拿转换后的 GCJ 点去比 WGS 圆心，会偏 500 多米，"家"永远算不进去。
  return regions.filter(region => points.some(point =>
    haversineM(point.latitude, point.longitude, region.lat, region.lon) <= region.radiusM
  ))
}

/** 某天（北京日期）的轨迹回看；`date` 缺省为今天 */
export function getTrackDay(deviceId: string, date: string = getBeijingDate()): TrackDayView {
  const window = getBeijingDayWindow(date)
  const all = listLocationPoints(deviceId, { from: window.start, to: window.end })

  const pathPoints = all.filter(point => point.accuracy === null || point.accuracy <= MAX_ACCURACY_FOR_PATH_M)
  const stays = listStays(deviceId, { from: window.start, to: window.end })
  const trips = listTrips(deviceId, { from: window.start, to: window.end })
  const regions = listRegions(deviceId)
  const totals = summarize(all, pathPoints.map(toPointView), stays, trips)

  return {
    date,
    points: pathPoints.map(toPointView),
    stays: stays.map(toStayView),
    trips: trips.map(toTripView),
    gaps: findGaps(all),
    droppedLowAccuracy: all.length - pathPoints.length,
    places: regionsVisited(regions, all),
    totals: {
      ...totals,
      byRegion: summarizeRegions(deviceId, window, regions, totals.lastFixAt)
    }
  }
}

/** 有定位数据的北京日期（倒序），用来标"哪天有数据" */
export function listTrackDays(deviceId: string = resolveRecentDeviceId() ?? '', limit = 90): string[] {
  if (!deviceId) return []
  const rows = connectDatabase().prepare(
    'SELECT recorded_at FROM phone_locations WHERE device_id = ? ORDER BY recorded_at DESC LIMIT ?'
  ).all(deviceId, 20000) as Array<{ recorded_at: string }>
  const days = new Set<string>()
  for (const row of rows) {
    // UTC → 北京日期：+8 小时后取日期部分
    days.add(new Date(Date.parse(row.recorded_at) + 8 * 3600_000).toISOString().slice(0, 10))
    if (days.size >= limit) break
  }
  return [...days].sort().reverse()
}
