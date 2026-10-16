import { describe, expect, it } from 'vitest'
import {
  MAX_ACCURACY_FOR_PATH_M,
  cleanTrackPoints,
  type CleanablePoint
} from '../services/phone/track-cleaner.js'

/**
 * 画线前的点清洗。两个规则，都来自真实数据的观察：
 * - **同秒多源重复**：gps/network/fused 三源并订，同一秒可能各报一个位置（实测差几十米）。
 * - **精度阈值**：偏点几乎全是 network 点（中位 51 米，最差 550 米），gps 中位只有 6.7 米。
 *
 * 清洗**只作用于画线与汇总**，原始点一个不删——以后换算法还能重算（ADR-0003 的原则）。
 */

function p(at: string, accuracy: number | null, lat = 31.86, lon = 117.16): CleanablePoint {
  return { recorded_at: at, latitude: lat, longitude: lon, accuracy }
}

describe('精度阈值', () => {
  it('超过阈值的点丢掉，并在计数里如实报出来', () => {
    const res = cleanTrackPoints([
      p('2026-10-16T04:00:00.000Z', 5),
      p('2026-10-16T04:01:00.000Z', MAX_ACCURACY_FOR_PATH_M + 1),
      p('2026-10-16T04:02:00.000Z', 100)
    ])

    expect(res.points).toHaveLength(1)
    expect(res.droppedLowAccuracy).toBe(2)
    expect(res.droppedDuplicates).toBe(0)
  })

  it('刚好等于阈值保留（边界不能含混）', () => {
    const res = cleanTrackPoints([p('2026-10-16T04:00:00.000Z', MAX_ACCURACY_FOR_PATH_M)])
    expect(res.points).toHaveLength(1)
    expect(res.droppedLowAccuracy).toBe(0)
  })

  it('没报精度的点不能当坏点丢掉（不知道不等于很差）', () => {
    const res = cleanTrackPoints([p('2026-10-16T04:00:00.000Z', null)])
    expect(res.points).toHaveLength(1)
  })
})

describe('同秒多源去重', () => {
  it('同一秒里有 gps 和 network 两个位置 → 只留准的那个', () => {
    const res = cleanTrackPoints([
      p('2026-10-16T04:00:00.100Z', 250, 31.87, 117.17), // network 飘了
      p('2026-10-16T04:00:00.900Z', 5) // gps
    ])

    expect(res.points).toHaveLength(1)
    expect(res.points[0].accuracy).toBe(5)
    expect(res.droppedDuplicates).toBe(1)
  })

  it('去重发生在阈值之前：唯一一个粗点先留下、再按阈值丢掉，两个计数分开记', () => {
    const res = cleanTrackPoints([p('2026-10-16T04:00:00.000Z', 250)])

    expect(res.points).toHaveLength(0)
    expect(res.droppedLowAccuracy).toBe(1)
    expect(res.droppedDuplicates).toBe(0)
  })

  it('去重留下粗点、丢掉细点时（细点是那个飘的）也按精度选', () => {
    const res = cleanTrackPoints([
      p('2026-10-16T04:00:00.000Z', 8),
      p('2026-10-16T04:00:00.500Z', 40)
    ])

    expect(res.points).toHaveLength(1)
    expect(res.points[0].accuracy).toBe(8)
  })

  it('都没报精度时保留第一个（总得留一个）', () => {
    const res = cleanTrackPoints([
      p('2026-10-16T04:00:00.100Z', null, 31.86, 117.16),
      p('2026-10-16T04:00:00.900Z', null, 31.87, 117.17)
    ])

    expect(res.points).toHaveLength(1)
    expect(res.points[0].latitude).toBe(31.86)
    expect(res.droppedDuplicates).toBe(1)
  })

  it('不同秒的点即使在同一分钟内都保留（60 秒一个点，别误伤）', () => {
    const res = cleanTrackPoints([
      p('2026-10-16T04:00:00.000Z', 5),
      p('2026-10-16T04:01:00.000Z', 5),
      p('2026-10-16T04:02:00.000Z', 5)
    ])

    expect(res.points).toHaveLength(3)
    expect(res.droppedDuplicates).toBe(0)
  })
})

describe('其它', () => {
  it('保持原有时间顺序（画线依赖顺序）', () => {
    const res = cleanTrackPoints([
      p('2026-10-16T04:00:00.000Z', 5, 31.1, 117.1),
      p('2026-10-16T04:01:00.000Z', 5, 31.2, 117.2),
      p('2026-10-16T04:02:00.000Z', 5, 31.3, 117.3)
    ])

    expect(res.points.map(x => x.latitude)).toEqual([31.1, 31.2, 31.3])
  })

  it('空数组不崩', () => {
    expect(cleanTrackPoints([])).toEqual({ points: [], droppedLowAccuracy: 0, droppedDuplicates: 0 })
  })

  it('阈值取 30 米（真实数据：gps 中位 6.7 米全留，network 中位 51 米大量出局）', () => {
    expect(MAX_ACCURACY_FOR_PATH_M).toBe(30)
  })
})
