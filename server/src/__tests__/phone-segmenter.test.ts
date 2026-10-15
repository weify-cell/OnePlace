import { describe, expect, it } from 'vitest'
import {
  countedStepM,
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

// ── 里程必须按精度过滤（实测倒逼：静止时 36–68 米精度下相邻点能差 20 米） ──

describe('步长门槛：噪声不该被算成走路', () => {
  it('精度差时抬高门槛：20 米位移在 68 米精度下不算移动', () => {
    expect(countedStepM(20, 68, 68, 60_000)).toBe(0)
  })

  it('精度好时保持原门槛：10 米精度下 80 米就是走了 80 米', () => {
    expect(countedStepM(80, 10, 10, 60_000)).toBe(80)
  })

  it('精度好且位移大于门槛就照常计入（真走路不受影响）', () => {
    expect(countedStepM(20, 5, 5, 60_000)).toBe(20)
  })

  it('精度中等时 12 米仍算噪声（门槛 = 平均精度 × 0.75）', () => {
    expect(countedStepM(12, 30, 30, 60_000)).toBe(0)
  })

  it('没有精度信息时退化为固定 10 米门槛', () => {
    expect(countedStepM(15, null, undefined, 60_000)).toBe(15)
    expect(countedStepM(5, null, undefined, 60_000)).toBe(0)
  })

  it('隐含速度离谱的是定位跳变，不是移动', () => {
    expect(countedStepM(5000, 10, 10, 1000)).toBe(0)
  })

  it('行程中途的定位噪声不灌进里程（真走路才计入）', () => {
    // 场景：走一段 → 在路口等待（精度差、抖动大）→ 再走一段 → 停下
    // 关键是噪声发生在**行程内部**：此时不会走「停留」分支，只能靠精度门槛拦住。
    // （早先那版用例把噪声放在开头，结果被停留逻辑吸收了，是假绿——变异验证才发现。）
    const base = Date.parse('2026-05-01T01:00:00.000Z')
    const lat = (m: number): number => 31.86 + m / 111320
    const points: TrackPoint[] = []
    let minute = 0
    let walked = 0

    const pushReal = (meters: number): void => {
      walked += meters
      points.push({ recordedAt: new Date(base + minute++ * 60_000).toISOString(), lat: lat(walked), lon: 117.16, accuracy: 8 })
    }
    // 抖动点：真实位置几乎没动，但精度差使报回的坐标偏 ±15 米（与实测同量级）
    const pushNoisy = (jitterM: number): void => {
      points.push({ recordedAt: new Date(base + minute++ * 60_000).toISOString(), lat: lat(walked + jitterM), lon: 117.16, accuracy: 45 })
    }

    for (let i = 0; i < 6; i++) pushReal(80)      // 走 480 米
    pushNoisy(15); pushNoisy(-15); pushNoisy(15)  // 路口等待，噪声
    for (let i = 0; i < 6; i++) pushReal(80)      // 再走 480 米
    for (let i = 0; i < 12; i++) {                // 到地方停下（闭合行程）
      points.push({ recordedAt: new Date(base + minute++ * 60_000).toISOString(), lat: lat(walked), lon: 117.16, accuracy: 8 })
    }

    const { closed } = reduceTrack(emptySegmenterState(), points)
    const trip = closed.find(s => s.kind === 'trip') as TripSegment | undefined

    expect(trip).toBeDefined()
    // 真走 960 米；结果 864 米：丢了约 96 米"紧贴噪声量级的真位移"（15 米的步子在 45 米
    // 精度下本来就分不清是走还是噪声，这个代价是自觉接受的），但**抖动一点没灌进来**。
    // 上界是关键的：没有精度门槛时，那三次 ±15 米抖动会额外算进 90 米（960 → 约 1050）。
    // 实测：干净实现 864，去掉精度门槛（变异）939 —— 上界必须卡在两者之间才有鉴别力
    expect(trip!.distanceM).toBeGreaterThan(840)
    expect(trip!.distanceM).toBeLessThan(920)
  })
})
