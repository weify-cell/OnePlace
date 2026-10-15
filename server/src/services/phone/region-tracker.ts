import { haversineM } from './track-segmenter.js'

/**
 * 区域越界判定：什么时候算"到家/到公司"。
 *
 * 与「停留」的区别在于**判定依据**：停留要"在一处待够 10 分钟"，所以"到家了"总是迟到；
 * 区域只看**越界**，但要防边界抖动——所以规定"越界后持续 2 分钟"才确认（进入与离开对称）。
 *
 * 纯函数：状态进出显式传递，不碰数据库、不碰时钟（时间只从点里读）。
 */

export const REGION_DWELL_MS = 2 * 60 * 1000

/** 精度宽容上限，与停留判定同一个规则：室内定位误差大，粗精度点不该把人甩出区域 */
const ACCURACY_SLACK_CAP_M = 100

/** 一个区域：有名字、有范围的地点 */
export interface RegionDef {
  id: number
  name: string
  lat: number
  lon: number
  radiusM: number
}

export interface RegionPoint {
  recordedAt: string
  lat: number
  lon: number
  /** 精度（米）；库里可能为 null，判定时按 0 处理 */
  accuracy?: number | null
}

export interface RegionStatus {
  /** 已确认的状态；null = 还没确立过（功能上线时你就在家，不该收到"到家了"） */
  inside: boolean | null
  /** 与已确认状态矛盾的趋势：往哪边、从哪一刻起 */
  trendInside: boolean | null
  trendSince: string | null
  /** 已处理到的点时刻，用来忽略重复上报 */
  lastPointAt: string | null
}

export type RegionState = Record<string, RegionStatus>

export interface RegionTransition {
  regionId: number
  regionName: string
  /** true = 到达，false = 离开 */
  inside: boolean
  /** 越界的**真实时刻**（趋势开始那一刻），不是确认时刻 */
  at: string
}

export function emptyRegionState(): RegionState {
  return {}
}

/** 点是否在区域内：半径 + 精度宽容（上限 100 米） */
export function isInsideRegion(region: RegionDef, point: RegionPoint): boolean {
  const slack = Math.min(Math.max(point.accuracy ?? 0, 0), ACCURACY_SLACK_CAP_M)
  return haversineM(point.lat, point.lon, region.lat, region.lon) <= region.radiusM + slack
}

function blankStatus(): RegionStatus {
  return { inside: null, trendInside: null, trendSince: null, lastPointAt: null }
}

/**
 * 喂进新点，得出状态与需要报出去的越界。
 *
 * 不修改传入的 state（返回新对象）——调用方可能要在失败时保留旧状态。
 */
export function reduceRegions(
  state: RegionState,
  regions: RegionDef[],
  points: RegionPoint[]
): { state: RegionState; transitions: RegionTransition[] } {
  const next: RegionState = {}
  for (const [key, value] of Object.entries(state)) next[key] = { ...value }

  const transitions: RegionTransition[] = []
  const ordered = [...points].sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt))

  for (const region of regions) {
    const key = String(region.id)
    const status = next[key] ?? blankStatus()
    next[key] = status

    for (const point of ordered) {
      // 重复、乱序上报的点一律忽略：否则"补传旧点"会把计时搅乱
      if (status.lastPointAt && Date.parse(point.recordedAt) <= Date.parse(status.lastPointAt)) continue
      status.lastPointAt = point.recordedAt

      const inside = isInsideRegion(region, point)

      // 首次观测：静默确立，不发事件
      if (status.inside === null) {
        status.inside = inside
        status.trendInside = null
        status.trendSince = null
        continue
      }

      // 回到已确认状态 → 之前的趋势作废（边界抖动到这里就被丢掉）
      if (inside === status.inside) {
        status.trendInside = null
        status.trendSince = null
        continue
      }

      if (status.trendInside !== inside) {
        // 新趋势，从这一刻起算
        status.trendInside = inside
        status.trendSince = point.recordedAt
        continue
      }

      // 趋势持续满 2 分钟 → 确认切换
      const heldMs = Date.parse(point.recordedAt) - Date.parse(status.trendSince as string)
      if (heldMs >= REGION_DWELL_MS) {
        status.inside = inside
        transitions.push({
          regionId: region.id,
          regionName: region.name,
          inside,
          at: status.trendSince as string
        })
        status.trendInside = null
        status.trendSince = null
      }
    }
  }

  return { state: next, transitions }
}
