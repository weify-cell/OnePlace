import { connectDatabase } from '../../database/index.js'
import type { TrackSegment } from './track-segmenter.js'

/**
 * 轨迹事件：从闭合的段里判定「到达某处」「离开某处」「一段行程结束」。
 *
 * 它是记忆与主动搭话的触发依据，所以只记录**发生时刻**（arrive 用停留开始时刻、
 * trip_end 用行程结束时刻），而不记录"什么时候被发现"——发现往往晚一步（段要闭合才知道）。
 * 推送环节据此判断事件是否还新鲜（避免半夜收到"你昨晚到家了"）。
 */

export type TrackEventType = 'arrive' | 'leave' | 'trip_end' | 'enter_region' | 'exit_region'

export interface StoredEvent {
  id: number
  device_id: string
  event_type: TrackEventType
  target_kind: 'stay' | 'trip' | 'region'
  target_id: number
  place_id: number | null
  occurred_at: string
  consumed_at: string | null
}

/**
 * 为闭合的段记录事件。`stayIds` / `tripIds` 由落表后回查得到——
 * 事件指向具体的段，这样推送时能说清"到了哪里"。
 * 重复调用不会产生重复事件（UNIQUE 约束 + INSERT OR IGNORE）。
 */
export function recordSegmentEvents(input: {
  deviceId: string
  segments: Array<{ segment: TrackSegment; id: number; placeId: number | null }>
}): number {
  const db = connectDatabase()
  const insert = db.prepare(`
    INSERT OR IGNORE INTO phone_events
      (device_id, event_type, target_kind, target_id, place_id, occurred_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  let created = 0
  db.transaction(() => {
    for (const { segment, id, placeId } of input.segments) {
      const events: Array<{ type: TrackEventType; at: string }> = segment.kind === 'stay'
        ? [{ type: 'arrive', at: segment.startedAt }, { type: 'leave', at: segment.endedAt }]
        : [{ type: 'trip_end', at: segment.endedAt }]

      for (const event of events) {
        const res = insert.run(
          input.deviceId,
          event.type,
          segment.kind,
          id,
          placeId,
          event.at
        )
        if (res.changes > 0) created++
      }
    }
  })()

  return created
}

/**
 * 区域边界事件（到家/到公司）。
 *
 * 与停留事件**同表同管道**：推送的静默时段、时效上限、每日额度、一轮一条全部直接继承，
 * 不另起一套机制。事件时刻用判定出的**真实越界时刻**（趋势开始那一刻），
 * 而不是"确认"时刻——否则日志会把 22:20 到家记成 22:22。
 *
 * 重复调用不会重复写（UNIQUE 含 occurred_at + INSERT OR IGNORE）：崩溃重放时
 * 重算出的同一条事件，occurred_at 逐字相同，照样被挡；而"今天第二次到家"时刻不同，能进去。
 */
export function recordRegionEvents(input: {
  deviceId: string
  transitions: Array<{ regionId: number; regionName: string; inside: boolean; at: string }>
}): number {
  if (input.transitions.length === 0) return 0
  const db = connectDatabase()
  const insert = db.prepare(`
    INSERT OR IGNORE INTO phone_events
      (device_id, event_type, target_kind, target_id, place_id, occurred_at)
    VALUES (?, ?, 'region', ?, ?, ?)
  `)

  let created = 0
  db.transaction(() => {
    for (const transition of input.transitions) {
      const res = insert.run(
        input.deviceId,
        transition.inside ? 'enter_region' : 'exit_region',
        transition.regionId,
        transition.regionId,
        transition.at
      )
      if (res.changes > 0) created++
    }
  })()

  return created
}

/** 未消费的事件，按发生时刻升序（推送环节用）。 */
export function listUnconsumedEvents(deviceId: string, opts?: { limit?: number }): StoredEvent[] {
  return connectDatabase().prepare(`
    SELECT * FROM phone_events
    WHERE device_id = ? AND consumed_at IS NULL
    ORDER BY occurred_at ASC, id ASC LIMIT ?
  `).all(deviceId, opts?.limit ?? 20) as StoredEvent[]
}

/** 标记事件已消费（发过了，或判定为过期/不该发）。 */
export function consumeEvents(eventIds: number[], consumedAt: string = new Date().toISOString()): void {
  if (eventIds.length === 0) return
  connectDatabase().prepare(`
    UPDATE phone_events SET consumed_at = ?
    WHERE id IN (${eventIds.map(() => '?').join(',')})
  `).run(consumedAt, ...eventIds)
}

export function listEvents(deviceId: string, opts?: { from?: string; to?: string }): StoredEvent[] {
  const conditions = ['device_id = ?']
  const values: Array<string | number> = [deviceId]
  if (opts?.from) { conditions.push('occurred_at >= ?'); values.push(opts.from) }
  if (opts?.to) { conditions.push('occurred_at < ?'); values.push(opts.to) }
  return connectDatabase().prepare(`
    SELECT * FROM phone_events WHERE ${conditions.join(' AND ')}
    ORDER BY occurred_at ASC, id ASC
  `).all(...values) as StoredEvent[]
}
