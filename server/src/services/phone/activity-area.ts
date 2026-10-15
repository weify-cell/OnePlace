import { haversineM } from './track-segmenter.js'

/**
 * 活动范围的几何刻画：把常去地点围成一个凸包，给出面积、中心与最远距离。
 *
 * 为什么用凸包而不是"最远两点直径"：凸包能表达"我活动的范围大约多大、朝哪个方向铺开"，
 * 面积与中心都有意义；而直径只给一个跨度，中间是空心还是实心看不出来。
 * 为什么不做聚类分区（"家一带/公司一带"）：那需要额外的阈值与命名规则，
 * 现在数据量（个位数地点）还不值得，等地点多了再做。
 *
 * 全部是纯函数——坐标用 WGS-84 原值算，跟换不换地图服务无关。
 */

export interface AreaPoint {
  id: number
  lat: number
  lon: number
}

export interface ActivityArea {
  /** 参与围包的地点数量 */
  pointCount: number
  /** 凸包顶点数（3 个以下说明这些地点近似在一条线上，面积无意义） */
  hullCount: number
  /** 面积（平方公里）；退化情况下为 0 */
  areaKm2: number
  centerLat: number
  centerLon: number
  /** 距中心最远的地点有多远（公里） */
  maxDistanceKm: number
}

/** 凸包（Andrew monotone chain）。输入乱序也没关系；共线点会被丢掉。 */
export function convexHull(points: AreaPoint[]): AreaPoint[] {
  if (points.length <= 2) return [...points]
  const sorted = [...points].sort((a, b) => (a.lon === b.lon ? a.lat - b.lat : a.lon - b.lon))

  const cross = (o: AreaPoint, a: AreaPoint, b: AreaPoint): number =>
    (a.lon - o.lon) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lon - o.lon)

  const build = (input: AreaPoint[]): AreaPoint[] => {
    const stack: AreaPoint[] = []
    for (const p of input) {
      while (stack.length >= 2 && cross(stack[stack.length - 2], stack[stack.length - 1], p) <= 0) {
        stack.pop()
      }
      stack.push(p)
    }
    return stack
  }

  const lower = build(sorted)
  const upper = build([...sorted].reverse())
  // 两端各有一个重复点，去掉
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** 球面多边形面积（平方米）。用等距圆柱近似把经纬度投影到米，够用且好读。 */
export function polygonAreaM2(hull: AreaPoint[]): number {
  if (hull.length < 3) return 0
  const lat0 = hull.reduce((sum, p) => sum + p.lat, 0) / hull.length
  const mPerDegLat = 111320
  const mPerDegLon = 111320 * Math.cos((lat0 * Math.PI) / 180)
  let sum = 0
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % hull.length]
    sum += a.lon * mPerDegLon * (b.lat * mPerDegLat) - b.lon * mPerDegLon * (a.lat * mPerDegLat)
  }
  return Math.abs(sum) / 2
}

/** 把一组地点概括成一个活动范围。 */
export function describeActivityArea(points: AreaPoint[]): ActivityArea | null {
  if (points.length === 0) return null
  const hull = convexHull(points)
  const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length
  const lon = points.reduce((sum, p) => sum + p.lon, 0) / points.length
  const maxDistanceM = Math.max(...points.map(p => haversineM(lat, lon, p.lat, p.lon)))
  return {
    pointCount: points.length,
    hullCount: hull.length,
    areaKm2: polygonAreaM2(hull) / 1_000_000,
    centerLat: lat,
    centerLon: lon,
    maxDistanceKm: maxDistanceM / 1000
  }
}
