import type { TrackDay } from '@/api/track.api'

/**
 * 把一天的轨迹整理成"画什么"。
 *
 * 单独抽出来是为了**能验**：地图渲染没法在无浏览器环境里验证，但"传给地图的坐标对不对"
 * 可以——而坐标画错（WGS-84 画到 GCJ-02 地图上）正是这个功能反复踩的坑。
 * 这里所有坐标一律取自接口的 `gcj*` 字段（服务端转换，前端不做坐标数学）。
 */

export type TrackOverlayKind = 'path' | 'stay' | 'stay-label' | 'region' | 'region-label'

export interface TrackOverlay {
  kind: TrackOverlayKind
  /** 折线路径（GCJ-02，[经度, 纬度] 顺序，与高德一致） */
  path?: Array<[number, number]>
  /** 圆与标签的位置（GCJ-02） */
  center?: [number, number]
  radius?: number
  text?: string
}

/** 停留圈最小半径：太小的圈在缩放下看不见 */
const MIN_STAY_RADIUS_M = 30

function humanMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`
}

export function buildTrackOverlays(day: TrackDay): TrackOverlay[] {
  const overlays: TrackOverlay[] = []

  if (day.points.length > 1) {
    overlays.push({
      kind: 'path',
      path: day.points.map(point => [point.gcjLon, point.gcjLat])
    })
  }

  for (const region of day.places) {
    overlays.push({
      kind: 'region',
      center: [region.gcjLon, region.gcjLat],
      radius: region.radiusM
    })
    overlays.push({
      kind: 'region-label',
      center: [region.gcjLon, region.gcjLat],
      text: region.name
    })
  }

  for (const stay of day.stays) {
    overlays.push({
      kind: 'stay',
      center: [stay.gcjLon, stay.gcjLat],
      radius: Math.max(stay.radiusM, MIN_STAY_RADIUS_M)
    })
    overlays.push({
      kind: 'stay-label',
      center: [stay.gcjLon, stay.gcjLat],
      text: `${stay.name ?? '停留'} · ${humanMinutes(stay.minutes)}`
    })
  }

  return overlays
}
