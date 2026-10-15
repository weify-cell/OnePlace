import { describe, expect, it } from 'vitest'
import {
  convexHull,
  describeActivityArea,
  polygonAreaM2,
  type AreaPoint
} from '../services/phone/activity-area.js'

/** 把"米"换成纬度/经度增量，便于构造已知尺寸的图形 */
const lat = (m: number): number => 31.86 + m / 111320
const lon = (m: number): number => 117.16 + m / (111320 * Math.cos((31.86 * Math.PI) / 180))
const p = (x: number, y: number, id = 0): AreaPoint => ({ id, lat: lat(y), lon: lon(x) })

describe('凸包', () => {
  it('正方形 + 内部点：内部点被排除，只剩四个角', () => {
    const hull = convexHull([p(0, 0, 1), p(1000, 0, 2), p(1000, 1000, 3), p(0, 1000, 4), p(500, 500, 5)])

    expect(hull).toHaveLength(4)
    expect(hull.map(h => h.id).sort()).toEqual([1, 2, 3, 4])
  })

  it('共线的点退化掉（面积无意义）', () => {
    const hull = convexHull([p(0, 0), p(500, 0), p(1000, 0)])

    expect(hull.length).toBeLessThanOrEqual(2)
    expect(polygonAreaM2(hull)).toBe(0)
  })

  it('一个点/两个点不崩', () => {
    expect(convexHull([p(0, 0)])).toHaveLength(1)
    expect(convexHull([p(0, 0), p(100, 100)])).toHaveLength(2)
    expect(convexHull([])).toEqual([])
  })
})

describe('活动范围', () => {
  it('1 公里见方的范围：面积约 1 平方公里，中心在几何中心', () => {
    const area = describeActivityArea([p(0, 0), p(1000, 0), p(1000, 1000), p(0, 1000)])!

    expect(area.areaKm2).toBeGreaterThan(0.95)
    expect(area.areaKm2).toBeLessThan(1.05)
    expect(area.pointCount).toBe(4)
    expect(area.maxDistanceKm).toBeCloseTo(0.707, 1) // 中心到角约 707 米
    expect(area.centerLat).toBeCloseTo(lat(500), 4)
  })

  it('地点近似排成一线：面积为 0，但跨度仍报出来', () => {
    const area = describeActivityArea([p(0, 0), p(3000, 0), p(6000, 0)])!

    expect(area.areaKm2).toBe(0)
    expect(area.maxDistanceKm).toBeCloseTo(3, 1)
  })

  it('只有一个地点：范围就是它自己', () => {
    const area = describeActivityArea([p(0, 0)])!

    expect(area.areaKm2).toBe(0)
    expect(area.maxDistanceKm).toBe(0)
    expect(area.pointCount).toBe(1)
  })

  it('没有地点就没有范围（返回 null，调用方不必特判空数组）', () => {
    expect(describeActivityArea([])).toBeNull()
  })
})
