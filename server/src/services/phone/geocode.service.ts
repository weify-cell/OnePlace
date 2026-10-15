import { connectDatabase } from '../../database/index.js'
import { getSettingValue, setSetting } from '../settings.service.js'
import { wgs84ToGcj02 } from './geo-coords.js'

/**
 * 地点反查（逆地理编码）：把停留中心的坐标换成"人话"——POI 名、结构化地址、所在区。
 *
 * 两个设计取舍：
 * - **只在新建地点时查一次**（不是逐点、也不是每次查询）：调用量每天最多几个，
 *   任何免费额度都绰绰有余；结果带时间戳缓存，查失败不写缓存，下一轮自动重试。
 * - **结果存 settings**（`phone_place_geo_<id>` 一个 JSON）而不是给 phone_places 加列：
 *   按本仓库约定不再新增迁移文件，加列会让新装环境缺列而崩。代价是这些字段不能直接用 SQL
 *   查询——目前只有"按地点取地名"和"列出所有已查地点"两种用法，键值存取足够。
 */

/** 高德 Web 服务 key（存 settings，与 AI provider 的 key 同一处理方式） */
export const AMAP_KEY_SETTING = 'amap_key'
/** 反查结果的存储键前缀 */
const GEO_KEY_PREFIX = 'phone_place_geo_'

export interface PlaceGeo {
  poiName: string | null
  /** POI 分类，形如「商务住宅;住宅区;住宅小区」，可用于判断"这像不像住宅" */
  poiType: string | null
  poiDistanceM: number | null
  address: string | null
  province: string | null
  city: string | null
  district: string | null
  township: string | null
  adcode: string | null
  /** 实际查询用的 GCJ-02 坐标（便于事后核对偏移） */
  gcjLat: number
  gcjLon: number
  source: 'amap'
  geocodedAt: string
}

export interface GeocodeResult {
  formattedAddress: string | null
  province: string | null
  city: string | null
  district: string | null
  township: string | null
  adcode: string | null
  pois: Array<{ name: string; type: string | null; distanceM: number | null }>
}

/** 反查调用入口：HTTP 是系统边界，测试可换掉而不必 mock 自家模块 */
export type RegeoFetcher = (lat: number, lon: number) => Promise<GeocodeResult>

export function getPlaceGeo(placeId: number): PlaceGeo | null {
  return getSettingValue<PlaceGeo | null>(`${GEO_KEY_PREFIX}${placeId}`, null)
}

export function savePlaceGeo(placeId: number, geo: PlaceGeo): void {
  setSetting(`${GEO_KEY_PREFIX}${placeId}`, geo)
}

/** 解析高德 regeo 的响应体（纯函数，便于用真实响应做用例）。 */
export function parseAmapRegeo(body: unknown): GeocodeResult | null {
  const json = body as { status?: string; info?: string; regeocode?: unknown }
  if (!json || json.status !== '1' || !json.regeocode) return null

  const rc = json.regeocode as {
    formatted_address?: string
    addressComponent?: Record<string, unknown>
    pois?: Array<Record<string, unknown>>
  }
  const ac = rc.addressComponent ?? {}
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const num = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  return {
    formattedAddress: str(rc.formatted_address),
    province: str(ac.province),
    // 直辖市（北京/上海/天津/重庆）与省直辖县时 city 为空，这是高德的既有行为
    city: str(ac.city),
    district: str(ac.district),
    township: str(ac.township),
    adcode: str(ac.adcode),
    pois: (rc.pois ?? [])
      .map(p => ({ name: str(p.name) ?? '', type: str(p.type), distanceM: num(p.distance) }))
      .filter(p => p.name)
  }
}

/** 真实调用高德逆地理编码。key 缺失或请求失败都返回 null（调用方负责重试，不抛）。 */
export async function fetchAmapRegeo(lat: number, lon: number): Promise<GeocodeResult> {
  const key = getSettingValue<string>(AMAP_KEY_SETTING, '')
  if (!key) throw new Error('未配置高德 key（settings.amap_key）')

  // 高德的坐标是 GCJ-02，必须先转换：直接用 WGS-84 会偏几百米且不报错
  const gcj = wgs84ToGcj02(lat, lon)
  const url = new URL('https://restapi.amap.com/v3/geocode/regeo')
  url.searchParams.set('location', `${gcj.lon.toFixed(6)},${gcj.lat.toFixed(6)}`) // 经度在前
  url.searchParams.set('key', key)
  url.searchParams.set('extensions', 'all') // 只有 all 才返回附近 POI
  url.searchParams.set('radius', '200') // 停留半径 100 米量级，取 200 米足够
  // 居家类 POI 优先。实测这个点三种取值输出相同，但语义上"停留"更接近居家而非路过
  url.searchParams.set('homeorcorp', '1')
  url.searchParams.set('output', 'JSON')

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`高德返回 HTTP ${res.status}`)
  const parsed = parseAmapRegeo(await res.json())
  if (!parsed) throw new Error('高德返回 status != 1（key 无效或额度用尽）')
  return parsed
}

/**
 * 把一次反查结果转成要落库的形状。
 *
 * **地名取高德返回的第一个 POI，不按距离自己排**——这是实测教训：
 * 你家楼下 99 米是"中国民生银行"、104 米是"博威香山丽舍"，按距离排会得到银行，
 * 而高德自己的排序已经把住宅小区排在银行前面（它综合了距离、类别与热度）。
 * 我一度自作聪明按距离排，结果是"你到了民生银行"。
 */
export function toPlaceGeo(lat: number, lon: number, result: GeocodeResult, now: Date = new Date()): PlaceGeo {
  const gcj = wgs84ToGcj02(lat, lon)
  const candidate = result.pois[0] ?? null
  return {
    poiName: candidate?.name ?? null,
    poiType: candidate?.type ?? null,
    poiDistanceM: candidate?.distanceM ?? null,
    address: result.formattedAddress,
    province: result.province,
    city: result.city,
    district: result.district,
    township: result.township,
    adcode: result.adcode,
    gcjLat: gcj.lat,
    gcjLon: gcj.lon,
    source: 'amap',
    geocodedAt: now.toISOString()
  }
}

/**
 * 给还没查过名字的地点补上地名。返回本次成功/失败数。
 *
 * - 已经查过的直接跳过（缓存即"查过"，失败不写缓存 → 下轮自动重试）
 * - 单个地点失败不影响其余；全部失败也只是记日志
 */
export async function geocodePendingPlaces(
  fetcher: RegeoFetcher = fetchAmapRegeo,
  opts?: { limit?: number }
): Promise<{ geocoded: number; failed: number; pending: number }> {
  const rows = connectDatabase().prepare(
    'SELECT id, center_lat, center_lon FROM phone_places ORDER BY id'
  ).all() as Array<{ id: number; center_lat: number; center_lon: number }>

  const todo = rows.filter(r => getPlaceGeo(r.id) === null).slice(0, opts?.limit ?? 20)
  let geocoded = 0
  let failed = 0
  for (const row of todo) {
    try {
      const result = await fetcher(row.center_lat, row.center_lon)
      savePlaceGeo(row.id, toPlaceGeo(row.center_lat, row.center_lon, result))
      geocoded++
    } catch (err) {
      failed++
      console.error(`[geocode] 地点 #${row.id} 反查失败：`, err)
    }
  }
  return {
    geocoded,
    failed,
    // 本轮之后仍没查到名字的地点（含本轮失败与超出 limit 的）
    pending: rows.filter(r => getPlaceGeo(r.id) === null).length
  }
}

/** 人话标签：手工名 > POI 名（带区） > 结构化地址 > 未命名地点。手工名永不被机器名覆盖。 */
export function placeLabel(placeId: number, manualName?: string | null): string {
  const manual = (manualName ?? '').trim()
  if (manual) return manual

  const geo = getPlaceGeo(placeId)
  if (!geo) return `未命名地点 #${placeId}`
  const area = geo.district ?? geo.city ?? ''
  if (geo.poiName) return area ? `${geo.poiName}（${area}）` : geo.poiName
  if (geo.address) return geo.address
  return `未命名地点 #${placeId}`
}

/** 已查过地名的地点里，出现过的区（供"我最近去过哪些区"这类问题用）。 */
export function knownDistricts(): string[] {
  const rows = connectDatabase().prepare(
    `SELECT key FROM settings WHERE key LIKE '${GEO_KEY_PREFIX}%'`
  ).all() as Array<{ key: string }>
  const districts = new Set<string>()
  for (const row of rows) {
    const geo = getSettingValue<PlaceGeo | null>(row.key, null)
    const district = geo?.district
    if (district) districts.add(district)
  }
  return [...districts].sort()
}
