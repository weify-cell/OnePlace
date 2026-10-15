import { connectDatabase } from '../../database/index.js'
import type { RegionDef } from './region-tracker.js'
import { getBeijingDate } from '../../utils/time.js'
import { haversineM } from './track-segmenter.js'
import { getPlaceGeo, type PlaceGeo } from './geocode.service.js'

/**
 * 常去地点：把停留归到同一处，并允许用户命名。
 *
 * 匹配用固定半径（200 m）就近归并——比聚类算法简单得多，且行为可预测：
 * 停在同一处就会被认成同一个地点，不反复产生"新地点"。
 */

/** 两处停留相距多少米以内算同一个地点 */
export const PLACE_MATCH_RADIUS_M = 200
/** 判定为「常去」的门槛 */
/** 手工新建区域时的默认半径 */
export const DEFAULT_PLACE_RADIUS_M = 200
/** 半径上限：再大就不是"家/公司"而是"整个城区"了，越界判定会失去意义 */
export const MAX_PLACE_RADIUS_M = 5000
const MAX_PLACE_NAME_CHARS = 40

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

/**
 * 该设备的区域清单——**有手工名字的地点**（机器查来的名字存在 settings 里，不进 name）。
 * 手动画定范围、命名，才算是"人认的地方"，用它做越界判定。
 */
export function listRegions(deviceId: string): RegionDef[] {
  return listDevicePlaces(deviceId)
    .filter(place => place.name !== null && place.name.trim() !== '')
    .map(place => ({ id: place.id, name: place.name as string, lat: place.center_lat, lon: place.center_lon, radiusM: place.radius_m }))
}

/** 界面上看到的一处地点（含高德查到的地址，机器名不冒充区域名） */
export interface PlaceAdminView {
  id: number
  /** 手工名（= 区域名）；null 表示还不是区域 */
  name: string | null
  centerLat: number
  centerLon: number
  radiusM: number
  hitCount: number
  dayCount: number
  lastSeenAt: string | null
  /** 是否已被划定为区域 */
  isRegion: boolean
  geo: PlaceGeo | null
}

function toAdminView(place: StoredPlace): PlaceAdminView {
  return {
    id: place.id,
    name: place.name,
    centerLat: place.center_lat,
    centerLon: place.center_lon,
    radiusM: place.radius_m,
    hitCount: place.hit_count,
    dayCount: place.day_count,
    lastSeenAt: place.last_seen_at,
    isRegion: place.name !== null && place.name.trim() !== '',
    geo: getPlaceGeo(place.id)
  }
}

function assertName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (trimmed.length === 0) throw new Error('名字不能为空')
  if (trimmed.length > MAX_PLACE_NAME_CHARS) throw new Error(`名字最多 ${MAX_PLACE_NAME_CHARS} 个字`)
  return trimmed
}

function assertCoord(lat: unknown, lon: unknown): void {
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('坐标必须是数字')
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('坐标超出有效范围')
}

function assertRadius(radiusM: unknown): number {
  if (typeof radiusM !== 'number' || !Number.isFinite(radiusM)) throw new Error('半径必须是数字')
  if (radiusM <= 0 || radiusM > MAX_PLACE_RADIUS_M) throw new Error(`半径要在 0 到 ${MAX_PLACE_RADIUS_M} 米之间`)
  return radiusM
}

/** 给界面看的地点列表（含高德查到的区划/地址）。 */
export function listPlacesForUi(deviceId: string): PlaceAdminView[] {
  return listPlaces(deviceId).map(toAdminView)
}

/**
 * 手工新建区域（地图上点一下 + 起名）。
 *
 * 附近已有地点（`PLACE_MATCH_RADIUS_M` 内）时**直接给它命名，不再建重复的**——
 * 一个是轨迹数据里长出来的，一个是人手点的，本来就是同一处；
 * 但圆心保留数据里那个（它来自真实停留点），只采纳人给的名字与范围。
 */
export function createPlace(input: {
  deviceId: string
  name: string
  lat: number
  lon: number
  radiusM?: number
}): { place: PlaceAdminView; merged: boolean } {
  const name = assertName(input.name)
  assertCoord(input.lat, input.lon)
  const radiusM = input.radiusM === undefined ? DEFAULT_PLACE_RADIUS_M : assertRadius(input.radiusM)

  const nearby = listDevicePlaces(input.deviceId).find(place =>
    haversineM(input.lat, input.lon, place.center_lat, place.center_lon) <= PLACE_MATCH_RADIUS_M
  )
  if (nearby) {
    connectDatabase().prepare('UPDATE phone_places SET name = ?, radius_m = ? WHERE id = ?').run(name, radiusM, nearby.id)
    return { place: toAdminView(getPlace(nearby.id) as StoredPlace), merged: true }
  }

  const res = connectDatabase().prepare(`
    INSERT INTO phone_places (device_id, center_lat, center_lon, radius_m, name, hit_count, day_count)
    VALUES (?, ?, ?, ?, ?, 0, 0)
  `).run(input.deviceId, input.lat, input.lon, radiusM, name)
  return { place: toAdminView(getPlace(Number(res.lastInsertRowid)) as StoredPlace), merged: false }
}

/**
 * 改一处地点：名字（改名 = 划定区域，清空 = 取消）、半径、圆心。
 * 不存在的编号返回 null；参数非法抛错（由控制器转成 400）。
 */
export function updatePlace(
  placeId: number,
  patch: { name?: string | null; radiusM?: number; lat?: number; lon?: number }
): PlaceAdminView | null {
  const existing = getPlace(placeId)
  if (!existing) return null

  const sets: string[] = []
  const values: unknown[] = []

  if ('name' in patch) {
    const raw = patch.name
    const name = raw === null || (typeof raw === 'string' && raw.trim() === '') ? null : assertName(raw)
    sets.push('name = ?')
    values.push(name)
  }
  if (patch.radiusM !== undefined) {
    sets.push('radius_m = ?')
    values.push(assertRadius(patch.radiusM))
  }
  if (patch.lat !== undefined || patch.lon !== undefined) {
    assertCoord(patch.lat, patch.lon)
    sets.push('center_lat = ?', 'center_lon = ?')
    values.push(patch.lat, patch.lon)
  }

  if (sets.length > 0) {
    connectDatabase().prepare(`UPDATE phone_places SET ${sets.join(', ')} WHERE id = ?`).run(...values, placeId)
  }
  return toAdminView(getPlace(placeId) as StoredPlace)
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
