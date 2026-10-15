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
  lat: number
  lon: number
  radiusM?: number
}): Promise<{ place: PlaceItem; merged: boolean }> {
  const { data } = await api.post<{ place: PlaceItem; merged: boolean }>('/phone/places', input)
  return data
}

/** 改名字（划定区域 / 清空即取消）、半径、圆心 */
export async function updatePlace(
  id: number,
  patch: { name?: string | null; radiusM?: number; lat?: number; lon?: number }
): Promise<PlaceItem> {
  const { data } = await api.patch<PlaceItem>(`/phone/places/${id}`, patch)
  return data
}
