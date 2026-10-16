/**
 * 画线前的点清洗（纯函数）。
 *
 * 两条规则都来自真实数据的观察，不是拍脑袋：
 * - **精度阈值 30 米**：当天 255 个点里，gps 点精度中位 **6.7 米**（很好），
 *   而 network 点中位 **51 米**、最差 550 米——画出来的"偏离路线"几乎全是这些。
 *   阈值 100 米时还留着 58 个 network 点，收到 30 米后只留 18 个，gps 几乎全留。
 * - **同秒多源去重**：采集端同时订 gps/network/fused，同一秒可能各报一个位置（实测差几十米），
 *   画出来就是一次来回抖。同一秒只留精度最好的那个。
 *
 * 清洗**只作用于画线与汇总**，原始点一个不删（ADR-0003：原始数据保留、结论可重算）。
 * 丢掉的点要如实计数报出来，不偷偷丢——"已滤掉 N 个"是页面上必须显示的信息。
 */

/** 画线用的点最多容忍多少米误差 */
export const MAX_ACCURACY_FOR_PATH_M = 30

export interface CleanablePoint {
  recorded_at: string
  latitude: number
  longitude: number
  accuracy: number | null
}

export interface CleanResult<T> {
  points: T[]
  droppedLowAccuracy: number
  droppedDuplicates: number
}

/** 按"秒"归组：同一秒内的多个点视为同一次定位的多个来源 */
function secondKey(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000)
}

export function cleanTrackPoints<T extends CleanablePoint>(points: T[]): CleanResult<T> {
  // 1) 同秒去重：保留精度最好的；都没报精度就保留第一个
  const bySecond = new Map<number, T>()
  let droppedDuplicates = 0
  for (const point of points) {
    const key = secondKey(point.recorded_at)
    const kept = bySecond.get(key)
    if (!kept) {
      bySecond.set(key, point)
      continue
    }
    droppedDuplicates++
    const keptAccuracy = kept.accuracy ?? Number.POSITIVE_INFINITY
    const candidateAccuracy = point.accuracy ?? Number.POSITIVE_INFINITY
    if (candidateAccuracy < keptAccuracy) bySecond.set(key, point)
  }

  // 2) 精度阈值（放在去重之后：粗精度点先参与"谁更准"的比较，再决定是否够格画线）
  const keptPoints: T[] = []
  let droppedLowAccuracy = 0
  for (const point of bySecond.values()) {
    if (point.accuracy !== null && point.accuracy > MAX_ACCURACY_FOR_PATH_M) {
      droppedLowAccuracy++
      continue
    }
    keptPoints.push(point)
  }

  return { points: keptPoints, droppedLowAccuracy, droppedDuplicates }
}
