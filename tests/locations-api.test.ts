import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 坐标系的守卫：本页坐标全部来自高德地图（GCJ-02），必须以 `coordSystem: 'gcj02'` 发给服务端。
 *
 * 为什么值得单独钉住：漏掉这个标记不会报任何错，只会把"家"存到 500 米外的另一条街上——
 * 正是线上刚踩过的坑（服务端查地名转了坐标，画图却用了 WGS-84）。
 */

const post = vi.fn()
const patch = vi.fn()
const get = vi.fn()

vi.mock('../src/api/index', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
    patch: (...args: unknown[]) => patch(...args)
  }
}))

import { createPlace, updatePlace } from '../src/api/locations.api'

beforeEach(() => {
  vi.clearAllMocks()
  post.mockResolvedValue({ data: {} })
  patch.mockResolvedValue({ data: {} })
})

describe('新区域的坐标', () => {
  it('告诉服务端这是地图坐标（GCJ-02），不是手机上报的 WGS-84', async () => {
    await createPlace({ name: '公司', coord: { lat: 31.99, lon: 117.99 }, radiusM: 200 })

    expect(post).toHaveBeenCalledWith('/phone/places', {
      name: '公司',
      lat: 31.99,
      lon: 117.99,
      radiusM: 200,
      coordSystem: 'gcj02'
    })
  })
})

describe('移动圆心的坐标', () => {
  it('带上坐标系标记', async () => {
    await updatePlace(7, { coord: { lat: 31.5, lon: 117.5 } })

    expect(patch).toHaveBeenCalledWith('/phone/places/7', {
      lat: 31.5,
      lon: 117.5,
      coordSystem: 'gcj02'
    })
  })

  it('只改名字时不带坐标字段（否则会把圆心洗成 0）', async () => {
    await updatePlace(7, { name: '家' })

    expect(patch).toHaveBeenCalledWith('/phone/places/7', { name: '家' })
  })

  it('清空名字（取消划定）同样不带坐标', async () => {
    await updatePlace(7, { name: '' })

    expect(patch).toHaveBeenCalledWith('/phone/places/7', { name: '' })
  })

  it('改半径时也不碰圆心', async () => {
    await updatePlace(7, { radiusM: 300 })

    expect(patch).toHaveBeenCalledWith('/phone/places/7', { radiusM: 300 })
  })
})
