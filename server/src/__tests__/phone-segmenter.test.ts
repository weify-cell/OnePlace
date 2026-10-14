import { describe, expect, it } from 'vitest'
import {
  DRIFT_MIN_STEP_M,
  emptySegmenterState,
  haversineM,
  reduceTrack,
  type SegmenterState,
  type TrackPoint,
  type TrackSegment
} from '../services/phone/track-segmenter.js'

/**
 * 切分是纯函数，这里的用例逐条钉住阈值边界——
 * 它的行为由规格决定（100 m / 10 分钟 / 300 m / 5 分钟 / 10 m），不是"把实现重算一遍"。
 */

const BASE = { lat: 31.86, lon: 117.28 }
const mToLat = (m: number): number => m / 111320
const mToLon = (m: number): number => m / (111320 * Math.cos((BASE.lat * Math.PI) / 180))

/** 相对基点的点（东/北偏移多少米） */
function pt(at: string, northM = 0, eastM = 0): TrackPoint {
  return { recordedAt: at, lat: BASE.lat + mToLat(northM), lon: BASE.lon + mToLon(eastM) }
}

/** 从 00:00:00 起、间隔 secondsPerPoint 秒的第 i 个点 */
function timed(i: number, secondsPerPoint: number, northM = 0, eastM = 0): TrackPoint {
  const secs = i * secondsPerPoint
  const hh = String(Math.floor(secs / 3600)).padStart(2, '0')
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0')
  const ss = String(secs % 60).padStart(2, '0')
  return pt(`2026-10-15T${hh}:${mm}:${ss}.000Z`, northM, eastM)
}

function feed(points: TrackPoint[], state: SegmenterState = emptySegmenterState()): {
  closed: TrackSegment[]
  state: SegmenterState
} {
  return reduceTrack(state, points)
}

const stays = (segs: TrackSegment[]): TrackSegment[] => segs.filter(s => s.kind === 'stay')
const trips = (segs: TrackSegment[]): TrackSegment[] => segs.filter(s => s.kind === 'trip')

describe('停留', () => {
  it('在一个地方待够 10 分钟、然后离开 → 产生一个停留段', () => {
    // 00:00 起每 30 秒一个点，共 11 分钟（23 个点，都在原地 5 m 内抖动），
    // 随后一个离开的点把这段闭合
    const points: TrackPoint[] = []
    for (let i = 0; i <= 22; i++) points.push(timed(i, 30, i % 2 === 0 ? 3 : -3, i % 3 === 0 ? 4 : -2))
    points.push(timed(24, 30, 600, 0))

    const { closed } = feed(points)

    expect(stays(closed)).toHaveLength(1)
    const stay = stays(closed)[0]
    if (stay.kind !== 'stay') throw new Error('unreachable')
    expect(stay.startedAt).toBe('2026-10-15T00:00:00.000Z')
    expect(stay.endedAt).toBe('2026-10-15T00:11:00.000Z')
    expect(stay.sampleCount).toBe(23)
    expect(stay.radiusM).toBeLessThan(10) // 都在原地抖动，半径很小
  })

  it('只待 9 分钟 → 不算停留（那段其实是走动）', () => {
    const points: TrackPoint[] = []
    for (let i = 0; i <= 18; i++) points.push(timed(i, 30, i % 2 === 0 ? 3 : -3, 0))
    points.push(timed(20, 30, 1000, 0))

    const { closed } = feed(points)

    expect(stays(closed)).toEqual([])
  })

  it('半径边界：99 m 仍在停留内，101 m 就打断', () => {
    const inside = feed([timed(0, 30), timed(11, 30, 99), timed(22, 30, 99), timed(23, 30, 101)])
    expect(stays(inside.closed)).toHaveLength(1)

    const outside = feed([timed(0, 30), timed(11, 30, 101)])
    expect(stays(outside.closed)).toEqual([])
  })

  it('跨天不切断：23:58 待到次日 00:12 是一个停留', () => {
    const points = [
      pt('2026-10-15T23:58:00.000Z'),
      pt('2026-10-16T00:05:00.000Z', 5),
      pt('2026-10-16T00:12:00.000Z', -5),
      pt('2026-10-16T00:20:00.000Z', 800) // 离开
    ]

    const { closed } = feed(points)

    expect(stays(closed)).toHaveLength(1)
    const stay = stays(closed)[0]
    if (stay.kind !== 'stay') throw new Error('unreachable')
    expect(stay.startedAt).toBe('2026-10-15T23:58:00.000Z')
    expect(stay.endedAt).toBe('2026-10-16T00:12:00.000Z')
  })
})

describe('行程', () => {
  it('走动超过 300 m 后停下待够 10 分钟 → 产生一段行程，里程接近实际', () => {
    const points: TrackPoint[] = []
    // 先在一个点待够 10 分钟（形成停留的闭合条件）
    for (let i = 0; i <= 21; i++) points.push(timed(i, 30, 0, 0))
    // 往前走 10 步、每步 40 m（共 400 m）
    for (let i = 1; i <= 10; i++) points.push(timed(21 + i, 30, i * 40, 0))
    // 在新位置停下待够 10 分钟以上
    for (let i = 1; i <= 23; i++) points.push(timed(31 + i, 30, 400, 0))

    const { closed } = feed(points)

    expect(trips(closed)).toHaveLength(1)
    const trip = trips(closed)[0]
    if (trip.kind !== 'trip') throw new Error('unreachable')
    expect(trip.distanceM).toBeGreaterThan(380)
    expect(trip.distanceM).toBeLessThan(420)
    // 停留：起点的停留 + 终点的停留（终点那个还没闭合，所以只算起点）
    expect(stays(closed)).toHaveLength(1)
  })

  it('只走 100 m 就停下 → 不算行程（低于 300 m 阈值）', () => {
    const points: TrackPoint[] = []
    for (let i = 0; i <= 21; i++) points.push(timed(i, 30))
    for (let i = 1; i <= 10; i++) points.push(timed(21 + i, 30, i * 10, 0))
    for (let i = 1; i <= 23; i++) points.push(timed(31 + i, 30, 100, 0))

    const { closed } = feed(points)

    expect(trips(closed)).toEqual([])
  })

  it('断档超过 5 分钟 → 断开，不把断档抹成一段直线里程', () => {
    const points = [
      timed(0, 30),
      timed(21, 30), // 停留待够 10 分钟
      pt('2026-10-15T00:11:00.000Z', 50),
      pt('2026-10-15T00:18:00.000Z', 5000) // 7 分钟后突然出现在 5 km 外
    ]

    const { closed } = feed(points)

    // 断档前累计不到 300 m，因此这一段不会被记成行程
    expect(trips(closed)).toEqual([])
  })

  it('小于 10 m 的步长不算里程（GPS 静止漂移）', () => {
    const points: TrackPoint[] = []
    for (let i = 0; i <= 21; i++) points.push(timed(i, 30))
    // 抖动 40 次、每次 5 m：真实位移极小，不该被记成 200 m
    for (let i = 1; i <= 40; i++) points.push(timed(21 + i, 30, (i % 2 === 0 ? 5 : 0), 0))
    points.push(timed(70, 30, 400, 0))

    const { closed } = feed(points)

    const trip = trips(closed)[0]
    if (trip && trip.kind === 'trip') {
      expect(trip.distanceM).toBeLessThan(DRIFT_MIN_STEP_M * 2)
    } else {
      expect(trips(closed)).toEqual([])
    }
  })
})

describe('输入形态的边界', () => {
  it('单点不产生任何段', () => {
    expect(feed([pt('2026-10-15T00:00:00.000Z')]).closed).toEqual([])
  })

  it('同一批点重喂不会产生重复段（幂等）', () => {
    const points = [
      pt('2026-10-15T00:00:00.000Z'),
      pt('2026-10-15T00:05:00.000Z', 5),
      pt('2026-10-15T00:11:00.000Z', -5),
      pt('2026-10-15T00:20:00.000Z', 900)
    ]

    const first = feed(points)
    expect(stays(first.closed)).toHaveLength(1)

    const again = reduceTrack(first.state, points)
    expect(again.closed).toEqual([])
  })

  it('分两批喂入与一次喂入结果一致（增量不改变结论）', () => {
    const points = [
      pt('2026-10-15T00:00:00.000Z'),
      pt('2026-10-15T00:05:00.000Z', 5),
      pt('2026-10-15T00:11:00.000Z', -5),
      pt('2026-10-15T00:20:00.000Z', 900)
    ]

    const whole = feed(points)
    const part1 = feed(points.slice(0, 2))
    const part2 = reduceTrack(part1.state, points.slice(2))

    expect([...part1.closed, ...part2.closed]).toEqual(whole.closed)
  })

  it('乱序点（时间倒退）被忽略，不产生倒退的段', () => {
    const { closed } = feed([
      pt('2026-10-15T00:10:00.000Z'),
      pt('2026-10-15T00:00:00.000Z'), // 倒退
      pt('2026-10-15T00:20:00.000Z', 5)
    ])

    expect(closed).toEqual([])
  })
})

describe('haversine 本身', () => {
  it('同一点距离为 0；1 米级的点距离也在 1 米附近', () => {
    expect(haversineM(BASE.lat, BASE.lon, BASE.lat, BASE.lon)).toBe(0)
    const d = haversineM(BASE.lat, BASE.lon, BASE.lat + mToLat(1), BASE.lon)
    expect(d).toBeGreaterThan(0.9)
    expect(d).toBeLessThan(1.1)
  })
})
