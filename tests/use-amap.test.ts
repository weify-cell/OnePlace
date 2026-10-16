import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAmap, type AmapNamespace } from '../src/composables/useAmap'

/**
 * 地图共用的失败面与初始化时序。
 *
 * 这里钉住的是刚踩过的坑：**容器还没渲染就初始化 → 地图再也不会被创建**，
 * 而且当时是"静默返回"，界面上只表现为"地图就是不出现"，毫无线索。
 */

interface CreatedMap {
  el: HTMLElement
  destroyed: boolean
  overlays: number
}

const created: CreatedMap[] = []

function fakeNamespace(): AmapNamespace {
  class MapStub {
    overlays = 0
    private record: CreatedMap
    constructor(el: HTMLElement) {
      this.record = { el, destroyed: false, overlays: 0 }
      created.push(this.record)
    }
    add(): void { this.overlays++; this.record.overlays++ }
    remove(): void {}
    setCenter(): void {}
    setZoom(): void {}
    setFitView(): void {}
    on(): void {}
    destroy(): void { this.record.destroyed = true }
  }
  class OverlayStub {
    constructor(_opts: unknown) {}
  }
  return { Map: MapStub as never, Marker: OverlayStub as never, Circle: OverlayStub as never, Polyline: OverlayStub as never }
}

const noopLoader = async (): Promise<void> => {}

beforeEach(() => {
  created.length = 0
  ;(window as unknown as { AMap?: AmapNamespace }).AMap = fakeNamespace()
})

afterEach(() => {
  delete (window as unknown as { AMap?: AmapNamespace }).AMap
})

describe('初始化', () => {
  it('容器在、key 也在 → 地图被创建，ready 为真', async () => {
    const amap = useAmap({ loadScript: noopLoader })
    amap.mapEl.value = document.createElement('div')

    await amap.init({ jsKey: 'test-key' })

    expect(amap.ready.value).toBe(true)
    expect(amap.error.value).toBeNull()
    expect(created).toHaveLength(1)
  })

  it('容器还没渲染出来 → **明确报错**，不静默失败', async () => {
    const amap = useAmap({ loadScript: noopLoader })
    amap.mapEl.value = null

    await amap.init({ jsKey: 'test-key' })

    expect(amap.ready.value).toBe(false)
    expect(amap.error.value).toContain('地图容器还没准备好')
    expect(created).toHaveLength(0)
  })

  it('没填 JS API key → 给指引，不加载脚本、不报错崩溃', async () => {
    const loader = vi.fn(noopLoader)
    const amap = useAmap({ loadScript: loader })
    amap.mapEl.value = document.createElement('div')

    await amap.init({ jsKey: '   ' })

    expect(amap.error.value).toContain('Web端(JS API)')
    expect(loader).not.toHaveBeenCalled()
    expect(created).toHaveLength(0)
  })

  it('脚本加载失败 → 报出来（不白屏）', async () => {
    const amap = useAmap({ loadScript: async () => { throw new Error('网络不通') } })
    amap.mapEl.value = document.createElement('div')

    await amap.init({ jsKey: 'test-key' })

    expect(amap.error.value).toContain('网络不通')
    expect(amap.ready.value).toBe(false)
  })

  it('脚本加载了但没暴露 AMap（key 类型不对）→ 说清原因', async () => {
    delete (window as unknown as { AMap?: AmapNamespace }).AMap
    const amap = useAmap({ loadScript: noopLoader })
    amap.mapEl.value = document.createElement('div')

    await amap.init({ jsKey: 'test-key' })

    expect(amap.error.value).toContain('平台类型')
  })

  it('重新初始化会先销毁旧地图（换 key 之后不残留）', async () => {
    const amap = useAmap({ loadScript: noopLoader })
    amap.mapEl.value = document.createElement('div')
    await amap.init({ jsKey: 'k1' })
    await amap.init({ jsKey: 'k2' })

    expect(created).toHaveLength(2)
    expect(created[0].destroyed).toBe(true)
    expect(created[1].destroyed).toBe(false)
  })
})
