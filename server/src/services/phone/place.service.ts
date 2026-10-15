import { connectDatabase } from '../../database/index.js'
import { getBeijingDate } from '../../utils/time.js'
import { haversineM } from './track-segmenter.js'

/**
 * 常去地点：把停留归到同一处，并允许用户命名。
 *
 * 匹配用固定半径（200 m）就近归并——比聚类算法简单得多，且行为可预测：
 * 停在同一处就会被认成同一个地点，不反复产生"新地点"。
 */

/** 两处停留相距多少米以内算同一个地点 */
export const PLACE_MATCH_RADIUS_M = 200
/** 判定为「常去」的门槛 */
export const FREQUENT_MIN_HITS = 3
export const FREQUENT_MIN_DAYS = 3

export interface StoredPlace {
  id: number
  device_id: string
  center_lat: number
  center_lon: number
  radius_m: number
  name: string | null
  hit_count: number
  day_count: number
  last_seen_at: string | null
}

/** 某地点是否算常去（命中够多且分散在够多天里） */
export function isFrequentPlace(place: { hit_count: number; day_count: number }): boolean {
  return place.hit_count >= FREQUENT_MIN_HITS && place.day_count >= FREQUENT_MIN_DAYS
}

function listDevicePlaces(deviceId: string): StoredPlace[] {
  return connectDatabase().prepare(
    'SELECT * FROM phone_places WHERE device_id = ? ORDER BY id'
  ).all(deviceId) as StoredPlace[]
}

/**
 * 把一个停留归到已有地点，或新建一个地点；返回地点 id。
 * 命中计数：每次停留都 +1；`day_count` 只在该地点上次出现于**别的北京日期**时 +1。
 */
export function matchOrCreatePlace(input: {
  deviceId: string
  centerLat: number
  centerLon: number
  radiusM: number
  stayedAt: string
}): number {
  const db = connectDatabase()
  const places = listDevicePlaces(input.deviceId)

  let best: StoredPlace | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const place of places) {
    const d = haversineM(place.center_lat, place.center_lon, input.centerLat, input.centerLon)
    if (d <= PLACE_MATCH_RADIUS_M && d < bestDistance) {
      best = place
      bestDistance = d
    }
  }

  const day = getBeijingDate(new Date(input.stayedAt))
  if (!best) {
    const res = db.prepare(`
      INSERT INTO phone_places (device_id, center_lat, center_lon, radius_m, hit_count, day_count, last_seen_at)
      VALUES (?, ?, ?, ?, 1, 1, ?)
    `).run(input.deviceId, input.centerLat, input.centerLon, input.radiusM, input.stayedAt)
    return Number(res.lastInsertRowid)
  }

  const lastDay = best.last_seen_at ? getBeijingDate(new Date(best.last_seen_at)) : null
  const addDay = lastDay !== day ? 1 : 0
  db.prepare(`
    UPDATE phone_places
    SET hit_count = hit_count + 1,
        day_count = day_count + ?,
        last_seen_at = ?,
        -- 中心缓慢跟随实测质心（只往新点挪 20%，避免一次异常点把地点拽走）
        center_lat = center_lat * 0.8 + ? * 0.2,
        center_lon = center_lon * 0.8 + ? * 0.2
    WHERE id = ?
  `).run(addDay, input.stayedAt, input.centerLat, input.centerLon, best.id)
  return best.id
}

/** 给地点命名（用户在微信里说「把那个地方命名为家」）。 */
export function namePlace(placeId: number, name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed) return false
  const res = connectDatabase().prepare('UPDATE phone_places SET name = ? WHERE id = ?').run(trimmed, placeId)
  return res.changes > 0
}

export function getPlace(placeId: number): StoredPlace | null {
  const row = connectDatabase().prepare('SELECT * FROM phone_places WHERE id = ?').get(placeId) as StoredPlace | undefined
  return row ?? null
}

/** 列出地点（默认按命中次数倒序）。 */
export function listPlaces(deviceId: string, opts?: { frequentOnly?: boolean }): StoredPlace[] {
  const places = listDevicePlaces(deviceId)
  const filtered = opts?.frequentOnly ? places.filter(isFrequentPlace) : places
  return filtered.sort((a, b) => b.hit_count - a.hit_count || a.id - b.id)
}

/** 最近一次停留对应的地点（命名工具的默认目标）。 */
export function mostRecentPlace(deviceId: string): StoredPlace | null {
  const row = connectDatabase().prepare(`
    SELECT p.* FROM phone_places p
    JOIN phone_stays s ON s.place_id = p.id
    WHERE p.device_id = ?
    ORDER BY s.started_at DESC LIMIT 1
  `).get(deviceId) as StoredPlace | undefined
  return row ?? null
}
