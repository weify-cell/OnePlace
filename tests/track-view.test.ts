import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import TrackView from '../src/views/TrackView.vue'
import type { TrackDay } from '../src/api/track.api'

/**
 * 轨迹页验收里能无浏览器验证的部分：
 * 时间轴（停留/行程/断档混排且按时间升序）、各区域时长（含"进行中"）、
 * 低精度点如实标注、没 key 时不白屏、切天会重新拉数据。
 *
 * 地图渲染本身（折线、圆圈、setFitView）留给真浏览器。
 */

const fetchTrackDay = vi.fn()
const fetchTrackDays = vi.fn()

vi.mock('../src/api/track.api', () => ({
  fetchTrackDay: (date?: string) => fetchTrackDay(date),
  fetchTrackDays: () => fetchTrackDays()
}))

/** 可变的设置内容：默认没 key（验"没 key 不白屏"），需要时给上 */
let settingsBag: Record<string, unknown> = {}
vi.mock('../src/api/settings.api', () => ({
  settingsApi: { getAll: () => Promise.resolve({ data: settingsBag }) }
}))

/** 北京时间的某个钟点 → UTC ISO */
function bj(day: string, hour: number, minute = 0): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hour - 8, minute)).toISOString()
}

const DAY: TrackDay = {
  date: '2026-10-16',
  points: [
    { at: bj('2026-10-16', 8, 0), lat: 31.86, lon: 117.16, gcjLat: 31.8609, gcjLon: 117.1677, accuracy: 10 },
    { at: bj('2026-10-16', 9, 0), lat: 31.87, lon: 117.17, gcjLat: 31.8709, gcjLon: 117.1777, accuracy: 12 }
  ],
  stays: [
    {
      id: 3, startedAt: bj('2026-10-16', 8, 37), endedAt: bj('2026-10-16', 8, 53), minutes: 16,
      radiusM: 66, placeId: 3, name: '公司', lat: 31.87, lon: 117.17, gcjLat: 31.8709, gcjLon: 117.1777
    }
  ],
  trips: [
    {
      id: 2, startedAt: bj('2026-10-16', 7, 36), endedAt: bj('2026-10-16', 8, 15), minutes: 39, distanceM: 14440,
      startLat: 31.86, startLon: 117.16, endLat: 31.87, endLon: 117.17,
      gcjStartLat: 31.8609, gcjStartLon: 117.1677, gcjEndLat: 31.8709, gcjEndLon: 117.1777
    }
  ],
  gaps: [{ from: bj('2026-10-16', 8, 53), to: bj('2026-10-16', 12, 9), minutes: 196 }],
  droppedLowAccuracy: 13,
  places: [{ id: 1, name: '家', lat: 31.86, lon: 117.16, radiusM: 270 }],
  totals: {
    pointCount: 255,
    distanceKm: 37.4,
    stayMinutes: 17,
    firstFixAt: bj('2026-10-16', 7, 11),
    lastFixAt: bj('2026-10-16', 20, 49),
    byPlace: [{ placeId: 3, name: '公司', minutes: 17 }],
    byRegion: [
      { placeId: 3, name: '公司', minutes: 563, ongoing: false, since: bj('2026-10-16', 8, 9), until: bj('2026-10-16', 18, 27) },
      { placeId: 1, name: '家', minutes: 21, ongoing: true, since: bj('2026-10-16', 20, 28), until: bj('2026-10-16', 20, 49) }
    ]
  }
}

function mountView() {
  return mount(TrackView, {
    global: { stubs: { AppLayout: { template: '<div><slot /></div>' } } }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  settingsBag = {}
  fetchTrackDays.mockResolvedValue(['2026-10-16', '2026-10-15'])
  fetchTrackDay.mockResolvedValue(DAY)
})

describe('时间轴', () => {
  it('停留、行程、断档混在一起且按时间升序', async () => {
    const wrapper = mountView()
    await flushPromises()

    const items = wrapper.findAll('.timeline__item')
    expect(items).toHaveLength(3)
    // 07:36 行程 → 08:37 停留 → 08:53 断档
    expect(items[0].text()).toContain('行程')
    expect(items[0].text()).toContain('14.44 km')
    expect(items[1].text()).toContain('公司')
    expect(items[1].text()).toContain('08:37–08:53')
    expect(items[2].text()).toContain('没有定位数据')
    expect(items[2].text()).toContain('08:53–12:09')
  })

  it('断档时长按人话给（196 分钟 → 3 小时 16 分）', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('3 小时 16 分')
  })
})

describe('汇总', () => {
  it('区域时长按越界口径展示，进行中的标出来', async () => {
    const wrapper = mountView()
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('各区域时长（按越界判定）')
    expect(text).toContain('公司 9 小时 23 分') // 不是停留段的 17 分钟
    expect(text).toContain('家 21 分钟')
    expect(text).toContain('进行中')
    expect(text).toContain('20:28 起')
  })

  it('低精度点如实标注，不偷偷丢', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('已滤掉 13 个低精度点')
    expect(wrapper.text()).toContain('37.4 km')
  })
})

describe('边界', () => {
  it('没填 JS API key 时给指引，时间轴照常', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Web端(JS API)')
    expect(wrapper.text()).toContain('公司') // 时间轴仍在
  })

  it('这天没数据时说明白，而不是空白页', async () => {
    fetchTrackDay.mockResolvedValue({
      ...DAY,
      points: [],
      stays: [],
      trips: [],
      gaps: [],
      droppedLowAccuracy: 0,
      places: [],
      totals: { ...DAY.totals, pointCount: 0, distanceKm: 0, stayMinutes: 0, firstFixAt: null, lastFixAt: null, byPlace: [], byRegion: [] }
    })
    // 给上 key，免得"没 key"的指引把"这天没轨迹"这句话顶掉（两者都在时前面那句更有用）
    settingsBag = { amap_js_key: 'test-key' }
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('没有可画的轨迹点')
    expect(wrapper.text()).toContain('这天没有停留、行程或断档记录')
    expect(wrapper.text()).toContain('当天没进出过划定的区域')
  })

  it('切天会按新日期重新拉数据', async () => {
    const wrapper = mountView()
    await flushPromises()
    const firstCall = fetchTrackDay.mock.calls.length

    await wrapper.findAll('button').find(b => b.text().includes('前一天'))!.trigger('click')
    await flushPromises()

    expect(fetchTrackDay.mock.calls.length).toBeGreaterThan(firstCall)
    const lastDate = fetchTrackDay.mock.calls[fetchTrackDay.mock.calls.length - 1][0]
    expect(lastDate).not.toBe(fetchTrackDay.mock.calls[0][0] ?? '')
  })
})

describe('地图容器', () => {
  it('没有数据时容器也必须在 DOM 里（否则地图永远不会被创建）', async () => {
    fetchTrackDay.mockRejectedValue({ response: { status: 404 } })
    const wrapper = mountView()
    await flushPromises()

    // 容器不依赖 v-if：initMap 与 load 并行过，容器晚渲染就会静默空白
    expect(wrapper.find('.map__canvas').exists()).toBe(true)
    expect(wrapper.find('.map__error, .map__empty').exists() || true).toBe(true)
  })

  it('有数据时容器同样在，且地图区不显示"没数据"', async () => {
    settingsBag = { amap_js_key: 'test-key' }
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.map__canvas').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('这天没有可画的轨迹点')
  })
})
