import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LocationsView from '../src/views/LocationsView.vue'
import type { PlaceItem } from '../src/api/locations.api'

/**
 * 位置页的验收里能无浏览器验证的部分：
 * - 没填 JS API key 时给出明确指引、列表照常能用（不白屏、不报错）
 * - 选中地点 → 表单回填；保存 → 发到服务端的载荷正确（名字/半径/圆心）
 * - 取消划定 = 把名字清空
 *
 * 地图本身（高德脚本、打点、画圆）在无浏览器环境里验证不了，留给真浏览器。
 */

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

const fetchPlaces = vi.fn()
const createPlace = vi.fn()
const updatePlace = vi.fn()

vi.mock('../src/api/locations.api', () => ({
  fetchPlaces: () => fetchPlaces(),
  createPlace: (input: unknown) => createPlace(input),
  updatePlace: (id: number, patch: unknown) => updatePlace(id, patch)
}))

const settingsGetAll = vi.fn()
const settingsSet = vi.fn()

vi.mock('../src/api/settings.api', () => ({
  settingsApi: {
    getAll: () => settingsGetAll(),
    set: (key: string, value: unknown) => settingsSet(key, value)
  }
}))

const PLACE: PlaceItem = {
  id: 1,
  name: null,
  centerLat: 31.862827483,
  centerLon: 117.16209704,
  radiusM: 85,
  hitCount: 1,
  dayCount: 1,
  lastSeenAt: '2026-10-15T13:58:20.062Z',
  isRegion: false,
  gcjLat: 31.860922,
  gcjLon: 117.167673,
  geo: {
    poiName: '博威香山丽舍',
    poiType: '商务住宅;住宅区;住宅小区',
    poiDistanceM: 104,
    address: '安徽省合肥市蜀山区蜀山新产业园区博威香山丽舍(东门)',
    province: '安徽省',
    city: '合肥市',
    district: '蜀山区',
    township: '蜀山新产业园区',
    adcode: '340104',
    gcjLat: 31.8609,
    gcjLon: 117.1677,
    geocodedAt: '2026-10-15T15:12:44.973Z'
  }
}

function mountView() {
  return mount(LocationsView, {
    global: { stubs: { AppLayout: { template: '<div><slot /></div>' } } }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // 地图在 jsdom 里永远不会就绪，所以"点列表项时处理函数里抛异常"这类问题
  // 组件用例看不见——但它会打到 console.error，这里把它变成失败
  consoleErrorSpy.mockClear()
  settingsGetAll.mockResolvedValue({ data: {} })
  fetchPlaces.mockResolvedValue({ device_id: 'dev-1', places: [PLACE] })
})

describe('没填 JS API key', () => {
  it('给出明确指引，而不是白屏；列表照常可用', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('Web端(JS API)')
    expect(wrapper.text()).toContain('本页其它部分不受影响')

    // 列表仍然渲染出这处地点，并带上高德查到的名字与区划
    expect(wrapper.text()).toContain('博威香山丽舍')
    expect(wrapper.text()).toContain('蜀山区')

    // 但地图没就绪时不能"划定新区域"（点了也没有地图可用）
    const createBtn = wrapper.findAll('button').find(b => b.text().includes('划定新区域'))
    expect(createBtn?.attributes('disabled')).toBeDefined()
  })

  it('没轨迹数据时说清楚，而不是空列表干瞪眼', async () => {
    fetchPlaces.mockResolvedValue({ device_id: null, places: [] })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('还没有手机轨迹数据')
  })
})

describe('划定区域', () => {
  it('选中地点 → 回填名字与半径；保存 → 载荷是名字+半径+圆心', async () => {
    updatePlace.mockResolvedValue({ ...PLACE, name: '家', isRegion: true })
    // 保存后页面会重新拉一次列表，这里让第二次返回已划定的样子
    fetchPlaces.mockResolvedValueOnce({ device_id: 'dev-1', places: [PLACE] })
    fetchPlaces.mockResolvedValue({ device_id: 'dev-1', places: [{ ...PLACE, name: '家', isRegion: true }] })
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('.list__item')[0].trigger('click')
    const nameInput = wrapper.find('.editor input')
    await nameInput.setValue('家')

    const saveBtn = wrapper.findAll('button').find(b => b.text() === '保存')!
    await saveBtn.trigger('click')
    await flushPromises()

    expect(updatePlace).toHaveBeenCalledWith(1, {
      name: '家',
      radiusM: 85,
      // 画在地图上的坐标（GCJ-02），不是 centerLat/centerLon
      coord: { lat: PLACE.gcjLat, lon: PLACE.gcjLon }
    })
    expect(wrapper.text()).toContain('已划定')
  })

  it('取消划定 = 把名字清空（地点本身留着）', async () => {
    const region: PlaceItem = { ...PLACE, name: '家', isRegion: true }
    fetchPlaces.mockResolvedValue({ device_id: 'dev-1', places: [region] })
    updatePlace.mockResolvedValue({ ...region, name: null, isRegion: false })

    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.list__item')[0].trigger('click')

    const clearBtn = wrapper.findAll('button').find(b => b.text().includes('取消划定'))!
    await clearBtn.trigger('click')
    await flushPromises()

    expect(updatePlace).toHaveBeenCalledWith(1, { name: '' })
  })

  it('选中地点时处理函数里不该抛异常（地图未就绪也不许炸）', async () => {
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('.list__item')[0].trigger('click')
    await flushPromises()

    const crashed = consoleErrorSpy.mock.calls.filter(call => String(call[0] ?? '').includes('TypeError'))
    expect(crashed).toEqual([])
  })

  it('服务端报错时把原话显示出来，不吞掉', async () => {
    updatePlace.mockRejectedValue({ response: { data: { error: '名字最多 40 个字' } } })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.list__item')[0].trigger('click')
    await wrapper.find('.editor input').setValue('家')

    await wrapper.findAll('button').find(b => b.text() === '保存')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('名字最多 40 个字')
  })
})

describe('高德 key 设置', () => {
  it('能读出已存的三个 key 并保存修改', async () => {
    settingsGetAll.mockResolvedValue({
      data: { amap_key: 'svc', amap_js_key: 'js', amap_js_security: 'sec' }
    })
    const wrapper = mountView()
    await flushPromises()

    await wrapper.findAll('button').find(b => b.text().includes('高德 key'))!.trigger('click')
    const inputs = wrapper.findAll('.keys input')
    expect((inputs[0].element as HTMLInputElement).value).toBe('svc')
    expect((inputs[1].element as HTMLInputElement).value).toBe('js')

    await inputs[0].setValue('svc2')
    await wrapper.findAll('button').find(b => b.text().includes('保存并重载'))!.trigger('click')
    await flushPromises()

    expect(settingsSet).toHaveBeenCalledWith('amap_key', 'svc2')
    expect(settingsSet).toHaveBeenCalledWith('amap_js_key', 'js')
  })
})
