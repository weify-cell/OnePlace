import { connectDatabase } from '../../database/index.js'

/**
 * 手机轨迹点：接收、校验、落表。
 *
 * 这一层只负责"可信地把点存下来"——不做任何解释（停留/行程在 track.service.ts）。
 * 幂等靠 `UNIQUE(device_id, recorded_at)`：App 断网重传、批量重发都不该产生重复点。
 */

export interface LocationPointInput {
  device_id?: string
  recorded_at?: string
  latitude?: unknown
  longitude?: unknown
  accuracy?: unknown
  speed?: unknown
  source?: unknown
}

export interface IngestResult {
  accepted: number
  duplicate: number
  rejected: number
}

/** 单批最多接受多少个点（一次上传不该把服务器拖住） */
export const MAX_POINTS_PER_BATCH = 1000

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function optionalNumber(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null
}

/** 点的必填字段是否都合法；不合法就整点拒绝（不存半条数据）。 */
function normalizePoint(point: LocationPointInput, fallbackDeviceId: string): {
  deviceId: string
  recordedAt: string
  lat: number
  lon: number
  accuracy: number | null
  speed: number | null
  source: string | null
} | null {
  const deviceId = String(point.device_id ?? fallbackDeviceId ?? '').trim()
  if (!deviceId) return null

  const recordedAt = String(point.recorded_at ?? '').trim()
  if (!recordedAt || Number.isNaN(Date.parse(recordedAt))) return null

  const { latitude, longitude } = point
  if (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90) return null
  if (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180) return null

  return {
    deviceId,
    recordedAt,
    lat: latitude,
    lon: longitude,
    accuracy: optionalNumber(point.accuracy),
    speed: optionalNumber(point.speed),
    source: typeof point.source === 'string' && point.source ? point.source : null
  }
}

/**
 * 接收一批轨迹点。返回各自的计数：
 * `accepted` 新入库、`duplicate` 已有同设备同采集时刻的点、`rejected` 数据不合格。
 */
export function ingestLocations(
  points: LocationPointInput[],
  opts?: { deviceId?: string }
): IngestResult {
  const result: IngestResult = { accepted: 0, duplicate: 0, rejected: 0 }
  if (!Array.isArray(points) || points.length === 0) return result

  const db = connectDatabase()
  // 同一条语句复用：批量里出现重复点时 changes 会是 0，正好被计成 duplicate
  const insert = db.prepare(`
    INSERT OR IGNORE INTO phone_locations
      (device_id, recorded_at, latitude, longitude, accuracy, speed, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  const fallbackDeviceId = opts?.deviceId ?? ''
  const runAll = db.transaction((batch: LocationPointInput[]) => {
    for (const raw of batch) {
      const point = normalizePoint(raw, fallbackDeviceId)
      if (!point) {
        result.rejected++
        continue
      }
      const res = insert.run(
        point.deviceId,
        point.recordedAt,
        point.lat,
        point.lon,
        point.accuracy,
        point.speed,
        point.source
      )
      if (res.changes === 0) result.duplicate++
      else result.accepted++
    }
  })

  runAll(points)
  return result
}

export interface StoredLocationPoint {
  device_id: string
  recorded_at: string
  latitude: number
  longitude: number
  accuracy: number | null
  speed: number | null
  source: string | null
}

/** 按采集时刻升序读取某设备的轨迹点（可选时间段，左闭右开）。 */
export function listLocationPoints(
  deviceId: string,
  opts?: { from?: string; to?: string; limit?: number }
): StoredLocationPoint[] {
  const conditions = ['device_id = ?']
  const values: Array<string | number> = [deviceId]
  if (opts?.from) {
    conditions.push('recorded_at >= ?')
    values.push(opts.from)
  }
  if (opts?.to) {
    conditions.push('recorded_at < ?')
    values.push(opts.to)
  }
  values.push(opts?.limit ?? 100000)
  return connectDatabase().prepare(
    `SELECT device_id, recorded_at, latitude, longitude, accuracy, speed, source
     FROM phone_locations WHERE ${conditions.join(' AND ')}
     ORDER BY recorded_at ASC, id ASC LIMIT ?`
  ).all(...values) as StoredLocationPoint[]
}
