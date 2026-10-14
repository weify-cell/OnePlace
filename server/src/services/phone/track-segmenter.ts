/**
 * 轨迹切分：原始轨迹点 → 停留与行程。
 *
 * 纯函数 + 显式状态：每喂进一批点，返回"本次闭合的段"与"新的状态"。
 * 于是它既能在服务端增量跑（每次收到上报只算新点），也能在测试里逐条喂点验证阈值边界。
 *
 * 判定规则（阈值集中在这里，改行为只改这一处）：
 * - 停留：连续点都落在首点 STAY_RADIUS_M 内，且跨越 STAY_MIN_MS
 * - 行程：两次停留之间的点，首尾直线位移 ≥ TRIP_MIN_DISTANCE_M；里程按相邻点累加
 * - 相邻点间隔超过 TRIP_MAX_GAP_MS 视为断档（App 被杀/没信号），断开当前行程，不把断档
 *   抹成一段直线里程
 * - 里程忽略小于 DRIFT_MIN_STEP_M 的步长（GPS 静止漂移）
 * - 不看日期，跨天不切断（晚上出门、凌晨回家是一趟）
 */

export interface TrackPoint {
  recordedAt: string
  lat: number
  lon: number
}

export interface StaySegment {
  kind: 'stay'
  startedAt: string
  endedAt: string
  centerLat: number
  centerLon: number
  radiusM: number
  sampleCount: number
}

export interface TripSegment {
  kind: 'trip'
  startedAt: string
  endedAt: string
  distanceM: number
  sampleCount: number
  startLat: number
  startLon: number
  endLat: number
  endLon: number
}

export type TrackSegment = StaySegment | TripSegment

/** 正在形成的停留（还没确认） */
interface StayRun {
  anchorLat: number
  anchorLon: number
  startedAt: string
  lastInsideAt: string
  samples: number
  sumLat: number
  sumLon: number
  maxRadiusM: number
}

/** 已确认停留之后、尚未闭合的移动 */
interface TripBuffer {
  startedAt: string
  lastAt: string
  samples: number
  distanceM: number
  firstLat: number
  firstLon: number
  lastLat: number
  lastLon: number
  /** 行程里"停下来"的候选锚点：它待够 STAY_MIN_MS 就变成下一个停留 */
  stillAnchorLat: number
  stillAnchorLon: number
  stillStartedAt: string
  stillSamples: number
  stillSumLat: number
  stillSumLon: number
}

export interface SegmenterState {
  /** 已处理到的采集时刻（含）；下次只喂更晚的点 */
  lastPointAt: string | null
  stay: StayRun | null
  trip: TripBuffer | null
}

export const STAY_RADIUS_M = 100
export const STAY_MIN_MS = 10 * 60 * 1000
export const TRIP_MIN_DISTANCE_M = 300
export const TRIP_MAX_GAP_MS = 5 * 60 * 1000
export const DRIFT_MIN_STEP_M = 10

export function emptySegmenterState(): SegmenterState {
  return { lastPointAt: null, stay: null, trip: null }
}

const EARTH_RADIUS_M = 6371000

/** 两点球面距离（米） */
export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number): number => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

function ms(a: string, b: string): number {
  return Date.parse(b) - Date.parse(a)
}

function newStayRun(p: TrackPoint): StayRun {
  return {
    anchorLat: p.lat,
    anchorLon: p.lon,
    startedAt: p.recordedAt,
    lastInsideAt: p.recordedAt,
    samples: 1,
    sumLat: p.lat,
    sumLon: p.lon,
    maxRadiusM: 0
  }
}

function stayIsConfirmed(run: StayRun): boolean {
  return run.samples >= 2 && ms(run.startedAt, run.lastInsideAt) >= STAY_MIN_MS
}

function closeStay(run: StayRun): StaySegment {
  return {
    kind: 'stay',
    startedAt: run.startedAt,
    endedAt: run.lastInsideAt,
    centerLat: run.sumLat / run.samples,
    centerLon: run.sumLon / run.samples,
    radiusM: Math.round(run.maxRadiusM * 10) / 10,
    sampleCount: run.samples
  }
}

/** 把一段"没待够的停留"并进行程缓冲：它其实是走动，起点就是那个锚点 */
function bufferFromStay(run: StayRun, p: TrackPoint): TripBuffer {
  const step = haversineM(run.anchorLat, run.anchorLon, p.lat, p.lon)
  return {
    startedAt: run.startedAt,
    lastAt: p.recordedAt,
    samples: run.samples + 1,
    distanceM: step >= DRIFT_MIN_STEP_M ? step : 0,
    firstLat: run.anchorLat,
    firstLon: run.anchorLon,
    lastLat: p.lat,
    lastLon: p.lon,
    stillAnchorLat: p.lat,
    stillAnchorLon: p.lon,
    stillStartedAt: p.recordedAt,
    stillSamples: 1,
    stillSumLat: p.lat,
    stillSumLon: p.lon
  }
}

function closeTrip(buf: TripBuffer, endedAt: string): TripSegment | null {
  if (buf.distanceM < TRIP_MIN_DISTANCE_M) return null
  return {
    kind: 'trip',
    startedAt: buf.startedAt,
    endedAt,
    distanceM: Math.round(buf.distanceM),
    sampleCount: buf.samples,
    startLat: buf.firstLat,
    startLon: buf.firstLon,
    endLat: buf.lastLat,
    endLon: buf.lastLon
  }
}

/**
 * 喂进一批按采集时刻升序排列的点，返回本次闭合的段与新状态。
 * 已处理过的点（≤ state.lastPointAt）会被忽略，因此同一批点重喂不会产生重复段。
 */
export function reduceTrack(
  state: SegmenterState,
  points: TrackPoint[]
): { state: SegmenterState; closed: TrackSegment[] } {
  const next: SegmenterState = {
    lastPointAt: state.lastPointAt,
    stay: state.stay ? { ...state.stay } : null,
    trip: state.trip ? { ...state.trip } : null
  }
  const closed: TrackSegment[] = []

  for (const p of points) {
    if (next.lastPointAt && Date.parse(p.recordedAt) <= Date.parse(next.lastPointAt)) continue

    const point = p
    while (true) {
      if (next.stay) {
        const d = haversineM(next.stay.anchorLat, next.stay.anchorLon, point.lat, point.lon)
        if (d <= STAY_RADIUS_M) {
          next.stay.samples++
          next.stay.sumLat += point.lat
          next.stay.sumLon += point.lon
          next.stay.maxRadiusM = Math.max(next.stay.maxRadiusM, d)
          next.stay.lastInsideAt = point.recordedAt
          break
        }
        if (stayIsConfirmed(next.stay)) {
          closed.push(closeStay(next.stay))
          // 行程从**停留中心**起算（而不是从第一个跑出半径的点）：否则已经走掉的那一段
          // 半径内距离会凭空消失（实测少算 120 m，足以让一趟真实行程落到阈值以下）
          const centerLat = next.stay.sumLat / next.stay.samples
          const centerLon = next.stay.sumLon / next.stay.samples
          const step = haversineM(centerLat, centerLon, point.lat, point.lon)
          next.trip = {
            startedAt: next.stay.lastInsideAt,
            lastAt: point.recordedAt,
            samples: 1,
            distanceM: step >= DRIFT_MIN_STEP_M ? step : 0,
            firstLat: centerLat,
            firstLon: centerLon,
            lastLat: point.lat,
            lastLon: point.lon,
            stillAnchorLat: point.lat,
            stillAnchorLon: point.lon,
            stillStartedAt: point.recordedAt,
            stillSamples: 1,
            stillSumLat: point.lat,
            stillSumLon: point.lon
          }
          next.stay = null
          break
        }
        // 没待够 → 这段其实是走动，转成行程缓冲后继续用同一个点走行程分支
        next.trip = bufferFromStay(next.stay, point)
        next.stay = null
        continue
      }

      if (next.trip) {
        const gap = ms(next.trip.lastAt, point.recordedAt)
        if (gap > TRIP_MAX_GAP_MS) {
          const seg = closeTrip(next.trip, next.trip.lastAt)
          if (seg) closed.push(seg)
          next.trip = null
          continue
        }
        const step = haversineM(next.trip.lastLat, next.trip.lastLon, point.lat, point.lon)
        if (step >= DRIFT_MIN_STEP_M) next.trip.distanceM += step
        next.trip.lastAt = point.recordedAt
        next.trip.lastLat = point.lat
        next.trip.lastLon = point.lon
        next.trip.samples++

        // 停下来了吗：在"静止锚点"附近累计够时长就变成下一个停留
        const dStill = haversineM(next.trip.stillAnchorLat, next.trip.stillAnchorLon, point.lat, point.lon)
        if (dStill <= STAY_RADIUS_M) {
          next.trip.stillSamples++
          next.trip.stillSumLat += point.lat
          next.trip.stillSumLon += point.lon
          if (ms(next.trip.stillStartedAt, point.recordedAt) >= STAY_MIN_MS && next.trip.stillSamples >= 2) {
            const seg = closeTrip(next.trip, next.trip.stillStartedAt)
            if (seg) closed.push(seg)
            next.stay = {
              anchorLat: next.trip.stillAnchorLat,
              anchorLon: next.trip.stillAnchorLon,
              startedAt: next.trip.stillStartedAt,
              lastInsideAt: point.recordedAt,
              samples: next.trip.stillSamples,
              sumLat: next.trip.stillSumLat,
              sumLon: next.trip.stillSumLon,
              maxRadiusM: dStill
            }
            next.trip = null
            break
          }
        } else {
          next.trip.stillAnchorLat = point.lat
          next.trip.stillAnchorLon = point.lon
          next.trip.stillStartedAt = point.recordedAt
          next.trip.stillSamples = 1
          next.trip.stillSumLat = point.lat
          next.trip.stillSumLon = point.lon
        }
        break
      }

      next.stay = newStayRun(point)
      break
    }

    next.lastPointAt = point.recordedAt
  }

  return { state: next, closed }
}
