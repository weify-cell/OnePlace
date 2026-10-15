import { beijingClock, getBeijingDayWindow } from '../../utils/time.js'
import { listStays, listTrips } from './track.service.js'
import { isFrequentPlace } from './place.service.js'
import { placeLabel } from './geocode.service.js'

/**
 * 一天的轨迹摘要：给记忆整理当素材用的一句话人话。
 *
 * 有意**不含原始坐标**：摘要是要喂给模型的，写了经纬度它就可能抄进记忆正文；
 * 地点用名字，没名字就用编号指代——这也顺便推动用户去命名常去的地方。
 * 流水（几点到几点走了多远）也尽量压缩：整理要抽的是结论，不是行程单。
 */
export function buildTrackSummary(deviceId: string, date: string): string {
  const window = getBeijingDayWindow(date)
  const stays = listStays(deviceId, { from: window.start, to: window.end })
  const trips = listTrips(deviceId, { from: window.start, to: window.end })
  if (stays.length === 0 && trips.length === 0) return ''

  const lines: string[] = []

  for (const stay of stays) {
    const minutes = Math.round((Date.parse(stay.ended_at) - Date.parse(stay.started_at)) / 60000)
    // 与工具、推送用同一套命名优先级：手工名 > 高德 POI 名（带区）> 地址 > 未命名
    const where = stay.place_id ? placeLabel(stay.place_id, stay.place_name) : '未命名地点'
    const frequent = stay.place_hit_count !== null && stay.place_day_count !== null
      && isFrequentPlace({ hit_count: stay.place_hit_count, day_count: stay.place_day_count })
    lines.push(`- 停留 ${beijingClock(stay.started_at)}–${beijingClock(stay.ended_at)}（${minutes} 分钟）：${where}${frequent ? '（常去）' : ''}`)
  }

  for (const trip of trips) {
    const minutes = Math.round((Date.parse(trip.ended_at) - Date.parse(trip.started_at)) / 60000)
    lines.push(`- 行程 ${beijingClock(trip.started_at)}–${beijingClock(trip.ended_at)}（${minutes} 分钟）：约 ${(trip.distance_m / 1000).toFixed(1)} km`)
  }

  const totalKm = (trips.reduce((sum, t) => sum + t.distance_m, 0) / 1000).toFixed(1)
  lines.push(`- 合计：停留 ${stays.length} 处（${[...new Set(stays.map(s => s.place_name ?? s.place_id))].length} 个地点）、行程 ${trips.length} 段、里程约 ${totalKm} km`)
  return lines.join('\n')
}
