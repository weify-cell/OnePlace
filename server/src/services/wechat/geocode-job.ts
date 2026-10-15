import { getSettingValue } from '../settings.service.js'
import { AMAP_KEY_SETTING, geocodePendingPlaces } from '../phone/geocode.service.js'
import { withInflight } from '../../utils/inflight.js'
import type { SubsystemJob } from './scheduler.js'

/**
 * 地点地名反查的兜底作业。
 *
 * 主路径是「收到新停留就顺手查一次」（见 phone.controller）——近实时、无需等。
 * 这里兜的是两种情况：那次调用失败（网络抖动/额度），以及机器人当时没在跑。
 * 没配高德 key 就直接跳过，不刷日志、不发请求。
 *
 * 注：它挂在微信子系统清单下（仓库里只有这一套调度接缝），因此只在机器人运行时才会跑；
 * 反查本身与微信无关，将来若有独立的应用级调度，应搬过去。
 */
export const geocodeJob: SubsystemJob = {
  name: 'geocode',
  run: () => withInflight('geocode', async () => {
    if (!getSettingValue<string>(AMAP_KEY_SETTING, '')) return
    const res = await geocodePendingPlaces()
    if (res.geocoded > 0 || res.failed > 0) {
      console.log(`[geocode] 本轮：成功 ${res.geocoded}、失败 ${res.failed}、仍待查 ${res.pending}`)
    }
  }),
  intervalMinutes: () => 10,
  initDelayMs: 2 * 60 * 1000
}
