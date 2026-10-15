import { Request, Response } from 'express'
import { MAX_POINTS_PER_BATCH } from '../services/phone/location.service.js'
import { ingestAndProcessLocations, resetRegionState, resolveRecentDeviceId } from '../services/phone/track.service.js'
import { createPlace, getPlace, listPlacesForUi, updatePlace } from '../services/phone/place.service.js'
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

/** 列出地点（含高德查到的地址），供地图页显示与划定区域。 */
export function getPlaces(_req: Request, res: Response): void {
  const deviceId = resolveRecentDeviceId()
  if (!deviceId) {
    res.json({ device_id: null, places: [] })
    return
  }
  res.json({ device_id: deviceId, places: listPlacesForUi(deviceId) })
}

/** 改一处地点：名字（划定/取消区域）、半径、圆心。 */
export function patchPlace(req: Request, res: Response): void {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: '地点编号不合法' })
    return
  }
  const body = (req.body ?? {}) as Record<string, unknown>
  // 只认这几个字段，别的一律忽略（避免前端顺手把 hit_count 之类也传进来）
  const patch: { name?: unknown; radiusM?: unknown; lat?: unknown; lon?: unknown; coordSystem?: unknown } = {}
  for (const key of ['name', 'radiusM', 'lat', 'lon', 'coordSystem'] as const) {
    if (key in body) patch[key] = body[key]
  }

  try {
    const before = getPlace(id)
    const place = updatePlace(id, patch as never)
    if (!place || !before) {
      res.status(404).json({ error: '地点不存在' })
      return
    }
    // 范围或名字变了 → 该处旧的"在内/在外"作废，否则下一批点会凭空报一次"离开"
    resetRegionState(before.device_id, id)
    res.json(place)
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '参数不合法' })
  }
}

/** 手工新建区域（地图上点一下 + 起名）。 */
export function postPlace(req: Request, res: Response): void {
  const deviceId = resolveRecentDeviceId()
  if (!deviceId) {
    res.status(400).json({ error: '还没有任何手机轨迹数据，不知道属于哪个设备' })
    return
  }
  const body = (req.body ?? {}) as Record<string, unknown>
  try {
    res.json(createPlace({
      deviceId,
      name: body.name as string,
      lat: body.lat as number,
      lon: body.lon as number,
      radiusM: body.radiusM as number | undefined,
      coordSystem: body.coordSystem as 'wgs84' | 'gcj02' | undefined
    }))
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : '参数不合法' })
  }
}
