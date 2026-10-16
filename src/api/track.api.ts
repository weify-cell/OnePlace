import { api } from './index'

/** 接口返回的都是**两套坐标**：WGS-84 是真相，GCJ-02 是画在高德地图上的那套 */
export interface TrackPoint {
  at: string
  lat: number
  lon: number
  gcjLat: number
  gcjLon: number
  accuracy: number | null
}

export interface TrackStay {
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

export interface TrackTrip {
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

/** 一段"没有定位数据"的时间：不是停在某处，而是真的没上报 */
export interface TrackGap {
  from: string
  to: string
  minutes: number
}

export interface TrackRegionStay {
  placeId: number
  name: string
  minutes: number
  ongoing: boolean
  since: string
  until: string
}

export interface TrackDay {
  date: string
  points: TrackPoint[]
  stays: TrackStay[]
  trips: TrackTrip[]
  gaps: TrackGap[]
  /** 精度太差被挡在折线之外的点数（如实报，不偷偷丢） */
  droppedLowAccuracy: number
  /** 同一秒多源重复被合并掉的点数 */
  droppedDuplicates: number
  /**
   * 当天去过的已划定区域。**只有 GCJ-02**：区域在服务端存的是 WGS-84，
   * 直接画会整体偏 500 多米，所以服务端干脆不发那套坐标——画错这件事写不出来。
   */
  places: Array<{ id: number; name: string; gcjLat: number; gcjLon: number; radiusM: number }>
  totals: {
    pointCount: number
    distanceKm: number
    stayMinutes: number
    firstFixAt: string | null
    lastFixAt: string | null
    byPlace: Array<{ placeId: number | null; name: string | null; minutes: number }>
    byRegion: TrackRegionStay[]
  }
}

export async function fetchTrackDay(date?: string): Promise<TrackDay> {
  const { data } = await api.get<TrackDay>('/phone/track', { params: date ? { date } : {} })
  return data
}

export async function fetchTrackDays(): Promise<string[]> {
  const { data } = await api.get<{ days: string[] }>('/phone/track/days')
  return data.days
}
