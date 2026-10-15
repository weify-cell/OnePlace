import { api } from './index'

/** 高德反查到的地名信息（服务端缓存，机器名不冒充区域名） */
export interface PlaceGeo {
  poiName: string | null
  poiType: string | null
  poiDistanceM: number | null
  address: string | null
  province: string | null
  city: string | null
  district: string | null
  township: string | null
  adcode: string | null
  gcjLat: number
  gcjLon: number
  geocodedAt: string
}

/**
 * 地图坐标系下的坐标（GCJ-02）。
 *
 * **本页所有坐标都来自高德地图，一律是 GCJ-02**：手机上报的 WGS-84 与它差 500 米左右，
 * 混用会把"家"画到另一条街上。所以这里用类型名字把它标出来，并由本模块统一附加
 * `coordSystem: 'gcj02'` 告诉服务端——服务端负责转回 WGS-84 存储，前端不做坐标数学。
 */
export interface MapCoord {
  lat: number
  lon: number
}

/** 界面上的一处地点；`name` 非空即为已划定的区域 */
export interface PlaceItem {
  id: number
  name: string | null
  centerLat: number
  centerLon: number
  radiusM: number
  hitCount: number
  dayCount: number
  lastSeenAt: string | null
  isRegion: boolean
  /** 同一处的 GCJ-02 坐标：画在高德地图上要用这两个，用 centerLat/centerLon 会偏 500 米 */
  gcjLat: number
  gcjLon: number
  geo: PlaceGeo | null
}

export interface PlaceListResponse {
  device_id: string | null
  places: PlaceItem[]
}

export async function fetchPlaces(): Promise<PlaceListResponse> {
  const { data } = await api.get<PlaceListResponse>('/phone/places')
  return data
}

/** 手工新建区域；落在已有地点附近时直接给它命名（merged=true） */
export async function createPlace(input: {
  name: string
  coord: MapCoord
  radiusM?: number
}): Promise<{ place: PlaceItem; merged: boolean }> {
  const { data } = await api.post<{ place: PlaceItem; merged: boolean }>('/phone/places', {
    name: input.name,
    lat: input.coord.lat,
    lon: input.coord.lon,
    radiusM: input.radiusM,
    coordSystem: 'gcj02'
  })
  return data
}

/** 改名字（划定区域 / 清空即取消）、半径、圆心；圆心用地图坐标，由本模块补坐标系标记 */
export async function updatePlace(
  id: number,
  patch: { name?: string | null; radiusM?: number; coord?: MapCoord }
): Promise<PlaceItem> {
  const payload: Record<string, unknown> = {}
  if ('name' in patch) payload.name = patch.name
  if (patch.radiusM !== undefined) payload.radiusM = patch.radiusM
  if (patch.coord) {
    payload.lat = patch.coord.lat
    payload.lon = patch.coord.lon
    payload.coordSystem = 'gcj02'
  }
  const { data } = await api.patch<PlaceItem>(`/phone/places/${id}`, payload)
  return data
}
