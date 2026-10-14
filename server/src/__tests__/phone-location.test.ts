import { beforeEach, describe, expect, it, vi } from 'vitest'

// 真库 + 真迁移（030 已建 phone_locations）
vi.mock('../database/index.js', async () => {
  const { connectDatabase } = await import('./helpers/test-db.js')
  return { connectDatabase }
})

import { connectDatabase } from '../database/index.js'
import { ingestLocations } from '../services/phone/location.service.js'

const DEVICE = 'device-aaa'
const OTHER_DEVICE = 'device-bbb'

function point(overrides: Record<string, unknown> = {}) {
  return {
    device_id: DEVICE,
    recorded_at: '2026-10-15T01:00:00.000Z',
    latitude: 31.86,
    longitude: 117.28,
    ...overrides
  }
}

function rows(): Array<{ device_id: string; recorded_at: string; latitude: number }> {
  return connectDatabase()
    .prepare('SELECT device_id, recorded_at, latitude FROM phone_locations ORDER BY device_id, recorded_at')
    .all() as Array<{ device_id: string; recorded_at: string; latitude: number }>
}

beforeEach(() => {
  connectDatabase().prepare('DELETE FROM phone_locations').run()
})

describe('接收轨迹点', () => {
  it('一批正常点全部入库', () => {
    const res = ingestLocations([
      point({ recorded_at: '2026-10-15T01:00:00.000Z' }),
      point({ recorded_at: '2026-10-15T01:00:30.000Z' }),
      point({ recorded_at: '2026-10-15T01:01:00.000Z' })
    ])

    expect(res).toEqual({ accepted: 3, duplicate: 0, rejected: 0 })
    expect(rows()).toHaveLength(3)
  })

  it('同一点重传不新增（幂等）：断网重发不会把轨迹灌两遍', () => {
    ingestLocations([point()])
    const again = ingestLocations([point()])

    expect(again).toEqual({ accepted: 0, duplicate: 1, rejected: 0 })
    expect(rows()).toHaveLength(1)
  })

  it('同一批里出现重复点也只算一次入库', () => {
    const res = ingestLocations([point(), point()])

    expect(res).toEqual({ accepted: 1, duplicate: 1, rejected: 0 })
    expect(rows()).toHaveLength(1)
  })

  it('乱序到达（后一批时间更早）不影响入库与读取顺序', () => {
    ingestLocations([point({ recorded_at: '2026-10-15T01:02:00.000Z' })])
    ingestLocations([point({ recorded_at: '2026-10-15T01:00:00.000Z' })])

    expect(rows().map(r => r.recorded_at)).toEqual([
      '2026-10-15T01:00:00.000Z',
      '2026-10-15T01:02:00.000Z'
    ])
  })

  it('不同设备互不干扰（同一时刻同一位置都入库）', () => {
    const res = ingestLocations([point(), point({ device_id: OTHER_DEVICE })])

    expect(res).toEqual({ accepted: 2, duplicate: 0, rejected: 0 })
    expect(rows().map(r => r.device_id)).toEqual([DEVICE, OTHER_DEVICE])
  })

  it('非法数据被拒绝且不写库：缺经纬度 / 越界 / 时间不可解析 / 缺设备', () => {
    const res = ingestLocations([
      point({ latitude: undefined }),
      point({ longitude: undefined }),
      point({ latitude: 91 }),
      point({ latitude: -91 }),
      point({ longitude: 181 }),
      point({ longitude: -181 }),
      point({ latitude: '31.86' }),
      point({ recorded_at: '昨天下午' }),
      point({ device_id: '' })
    ])

    expect(res).toEqual({ accepted: 0, duplicate: 0, rejected: 9 })
    expect(rows()).toEqual([])
  })

  it('好点与坏点混在一批：各自计数正确', () => {
    const res = ingestLocations([
      point({ recorded_at: '2026-10-15T02:00:00.000Z' }),
      point({ latitude: NaN }),
      point({ recorded_at: '2026-10-15T02:00:00.000Z' }) // 与第一条重复
    ])

    expect(res).toEqual({ accepted: 1, duplicate: 1, rejected: 1 })
    expect(rows()).toHaveLength(1)
  })

  it('可选字段（精度、速度、来源）原样留着，缺失时为 NULL', () => {
    ingestLocations([
      point({ recorded_at: '2026-10-15T03:00:00.000Z', accuracy: 12.5, speed: 1.4, source: 'gps' }),
      point({ recorded_at: '2026-10-15T03:00:30.000Z' })
    ])

    const withMeta = connectDatabase()
      .prepare('SELECT accuracy, speed, source FROM phone_locations WHERE recorded_at = ?')
      .get('2026-10-15T03:00:00.000Z') as { accuracy: number; speed: number; source: string }
    const withoutMeta = connectDatabase()
      .prepare('SELECT accuracy, speed, source FROM phone_locations WHERE recorded_at = ?')
      .get('2026-10-15T03:00:30.000Z') as { accuracy: number | null; speed: number | null; source: string | null }

    expect(withMeta).toMatchObject({ accuracy: 12.5, speed: 1.4, source: 'gps' })
    expect(withoutMeta).toMatchObject({ accuracy: null, speed: null, source: null })
  })
})
