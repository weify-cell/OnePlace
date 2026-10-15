import { connectDatabase } from '../../database/index.js'
import { ingestLocations, listLocationPoints, type IngestResult, type LocationPointInput } from './location.service.js'
import { matchOrCreatePlace } from './place.service.js'
import { recordSegmentEvents } from './event.service.js'
import {
  emptySegmenterState,
  reduceTrack,
  type SegmenterState,
  type StaySegment,
  type TrackPoint,
  type TripSegment
} from './track-segmenter.js'

/**
 * 轨迹加工：把原始轨迹点增量切成停留与行程，落到表里。
 *
 * 「增量」靠 phone_track_state 存纯函数的状态：每次只喂上次之后的新点，
 * 因此加工成本与新增点数成正比，而不是与历史总量成正比（30 秒一个点、保留 90 天，
 * 全量重算会越来越慢）。
 */

export interface StoredStay {
  id: number
  device_id: string
  started_at: string
  ended_at: string
  center_lat: number
  center_lon: number
  radius_m: number
  sample_count: number
  /** 归属的常去地点（命名之后机器人就能用名字指代它） */
  place_id: number | null
  place_name: string | null
  place_hit_count: number | null
  place_day_count: number | null
}

export interface StoredTrip {
  id: number
  device_id: string
  started_at: string
  ended_at: string
  distance_m: number
  sample_count: number
  start_lat: number
  start_lon: number
  end_lat: number
  end_lon: number
}

function loadState(deviceId: string): SegmenterState {
  const row = connectDatabase()
    .prepare('SELECT state FROM phone_track_state WHERE device_id = ?')
    .get(deviceId) as { state: string } | undefined
  if (!row) return emptySegmenterState()
  try {
    return JSON.parse(row.state) as SegmenterState
  } catch {
    console.error(`[phone] track state 无法解析，从空状态重算：device=${deviceId}`)
    return emptySegmenterState()
  }
}

function saveState(deviceId: string, state: SegmenterState): void {
  connectDatabase().prepare(`
    INSERT INTO phone_track_state (device_id, state, updated_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(device_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
  `).run(deviceId, JSON.stringify(state))
}

/**
 * 落一条停留，返回 `{ id, created }`。
 * `created` 很关键：只有**新建**时才去匹配地点、记事件——
 * 否则「崩溃后重跑加工」会把同一个停留的地点命中次数重复累加。
 */
function insertStay(deviceId: string, stay: StaySegment): { id: number; created: boolean } {
  const db = connectDatabase()
  const res = db.prepare(`
    INSERT OR IGNORE INTO phone_stays
      (device_id, started_at, ended_at, center_lat, center_lon, radius_m, sample_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(deviceId, stay.startedAt, stay.endedAt, stay.centerLat, stay.centerLon, stay.radiusM, stay.sampleCount)
  if (res.changes > 0) return { id: Number(res.lastInsertRowid), created: true }
  const row = db.prepare('SELECT id FROM phone_stays WHERE device_id = ? AND started_at = ? AND ended_at = ?')
    .get(deviceId, stay.startedAt, stay.endedAt) as { id: number } | undefined
  return { id: row?.id ?? 0, created: false }
}

function insertTrip(deviceId: string, trip: TripSegment): { id: number; created: boolean } {
  const db = connectDatabase()
  const res = db.prepare(`
    INSERT OR IGNORE INTO phone_trips
      (device_id, started_at, ended_at, start_lat, start_lon, end_lat, end_lon, distance_m, sample_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    deviceId,
    trip.startedAt,
    trip.endedAt,
    trip.startLat,
    trip.startLon,
    trip.endLat,
    trip.endLon,
    trip.distanceM,
    trip.sampleCount
  )
  if (res.changes > 0) return { id: Number(res.lastInsertRowid), created: true }
  const row = db.prepare('SELECT id FROM phone_trips WHERE device_id = ? AND started_at = ? AND ended_at = ?')
    .get(deviceId, trip.startedAt, trip.endedAt) as { id: number } | undefined
  return { id: row?.id ?? 0, created: false }
}

/**
 * 把某设备尚未加工过的轨迹点切分并入表。
 * 返回本次闭合的段数——便于上报接口记日志，也便于测试断言"增量只算新点"。
 */
export function processNewLocations(deviceId: string): { stays: number; trips: number } {
  const state = loadState(deviceId)
  const points: TrackPoint[] = listLocationPoints(deviceId, { from: state.lastPointAt ?? undefined })
    .filter(p => !state.lastPointAt || Date.parse(p.recorded_at) > Date.parse(state.lastPointAt))
    .map(p => ({ recordedAt: p.recorded_at, lat: p.latitude, lon: p.longitude }))

  if (points.length === 0) return { stays: 0, trips: 0 }

  const { state: nextState, closed } = reduceTrack(state, points)

  let stays = 0
  let trips = 0
  const db = connectDatabase()
  db.transaction(() => {
    const forEvents: Array<{ segment: (typeof closed)[number]; id: number; placeId: number | null }> = []
    for (const segment of closed) {
      if (segment.kind === 'stay') {
        const { id, created } = insertStay(deviceId, segment)
        if (created) {
          stays++
          // 归属到某处「常去地点」（200 m 内算同一处，没有就新建）
          const placeId = matchOrCreatePlace({
            deviceId,
            centerLat: segment.centerLat,
            centerLon: segment.centerLon,
            radiusM: segment.radiusM,
            stayedAt: segment.startedAt
          })
          db.prepare('UPDATE phone_stays SET place_id = ? WHERE id = ?').run(placeId, id)
          forEvents.push({ segment, id, placeId })
        }
      } else {
        const { id, created } = insertTrip(deviceId, segment)
        if (created) {
          trips++
          forEvents.push({ segment, id, placeId: null })
        }
      }
    }
    if (forEvents.length > 0) recordSegmentEvents({ deviceId, segments: forEvents })
    saveState(deviceId, nextState)
  })()

  return { stays, trips }
}

/** 按时间段读停留（左闭右开；按开始时刻升序）。 */
export function listStays(deviceId: string, opts?: { from?: string; to?: string; limit?: number }): StoredStay[] {
  const conditions = ['device_id = ?']
  const values: Array<string | number> = [deviceId]
  if (opts?.from) { conditions.push('started_at >= ?'); values.push(opts.from) }
  if (opts?.to) { conditions.push('started_at < ?'); values.push(opts.to) }
  values.push(opts?.limit ?? 200)
  const where = conditions.map(c => `s.${c}`).join(' AND ')
  return connectDatabase().prepare(
    `SELECT s.id, s.device_id, s.started_at, s.ended_at, s.center_lat, s.center_lon,
            s.radius_m, s.sample_count,
            p.id AS place_id, p.name AS place_name, p.hit_count AS place_hit_count, p.day_count AS place_day_count
     FROM phone_stays s LEFT JOIN phone_places p ON p.id = s.place_id
     WHERE ${where}
     ORDER BY s.started_at ASC, s.id ASC LIMIT ?`
  ).all(...values) as StoredStay[]
}

/** 按时间段读行程（左闭右开；按开始时刻升序）。 */
export function listTrips(deviceId: string, opts?: { from?: string; to?: string; limit?: number }): StoredTrip[] {
  const conditions = ['device_id = ?']
  const values: Array<string | number> = [deviceId]
  if (opts?.from) { conditions.push('started_at >= ?'); values.push(opts.from) }
  if (opts?.to) { conditions.push('started_at < ?'); values.push(opts.to) }
  values.push(opts?.limit ?? 200)
  return connectDatabase().prepare(
    `SELECT id, device_id, started_at, ended_at, distance_m, sample_count, start_lat, start_lon, end_lat, end_lon
     FROM phone_trips WHERE ${conditions.join(' AND ')}
     ORDER BY started_at ASC, id ASC LIMIT ?`
  ).all(...values) as StoredTrip[]
}

/**
 * 单机部署下没传 device_id 时用哪个设备：取最近有轨迹点的那个。
 * 多设备时调用方必须显式指定（不猜）。
 */
export function resolveRecentDeviceId(): string | null {
  const row = connectDatabase().prepare(
    'SELECT device_id FROM phone_locations ORDER BY recorded_at DESC, id DESC LIMIT 1'
  ).get() as { device_id: string } | undefined
  return row?.device_id ?? null
}

/**
 * 上报即加工：收下轨迹点后立刻切分该设备新增的点。
 *
 * 放在服务层而不是控制器里，是因为"摄入之后马上加工"是这条链路的行为约定
 * （近实时），而不是 HTTP 的细节；放这里也才能在服务 seam 上验证。
 */
export function ingestAndProcessLocations(
  points: LocationPointInput[],
  opts?: { deviceId?: string }
): IngestResult & { stays: number; trips: number } {
  const result = ingestLocations(points, opts)
  if (result.accepted === 0) return { ...result, stays: 0, trips: 0 }

  const devices = new Set<string>()
  for (const point of points) {
    const deviceId = String(point.device_id ?? opts?.deviceId ?? '').trim()
    if (deviceId) devices.add(deviceId)
  }

  let stays = 0
  let trips = 0
  for (const deviceId of devices) {
    const processed = processNewLocations(deviceId)
    stays += processed.stays
    trips += processed.trips
  }
  return { ...result, stays, trips }
}
