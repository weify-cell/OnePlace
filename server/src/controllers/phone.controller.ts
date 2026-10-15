import { Request, Response } from 'express'
import { MAX_POINTS_PER_BATCH } from '../services/phone/location.service.js'
import { ingestAndProcessLocations } from '../services/phone/track.service.js'
import { geocodePendingPlaces } from '../services/phone/geocode.service.js'

/**
 * 接收一批轨迹点。
 * 薄壳：只做形状校验与转调，业务判断（哪些点合格、哪些重复）全在服务里。
 */
export function postLocations(req: Request, res: Response): void {
  const body = (req.body ?? {}) as { device_id?: unknown; points?: unknown }

  if (!Array.isArray(body.points) || body.points.length === 0) {
    res.status(400).json({ error: 'points 必须是非空数组' })
    return
  }
  if (body.points.length > MAX_POINTS_PER_BATCH) {
    res.status(400).json({ error: `单批最多 ${MAX_POINTS_PER_BATCH} 个点` })
    return
  }

  const deviceId = typeof body.device_id === 'string' ? body.device_id : ''
  const result = ingestAndProcessLocations(body.points as never[], { deviceId })
  res.json(result)

  // 新地点顺手查一次地名：不阻塞响应（反查是网络调用），失败也不写缓存、下轮重试
  if (result.stays > 0) {
    void geocodePendingPlaces().catch(err => console.error('[geocode] 触发失败：', err))
  }
}
