import { ref, type Ref } from 'vue'

/**
 * 高德 JS API 的加载与地图初始化，抽出来给多个页面共用。
 *
 * 为什么要有这一件：加第二个地图页时最容易发生的是**复制一份加载逻辑**，
 * 然后两份各自漂移（坐标约定、失败提示、securityJsCode 处理）。
 * 这里只做"把地图弄出来"，读哪个 key、画什么，由页面自己决定。
 */

interface AmapLngLat {
  getLng(): number
  getLat(): number
}

export interface AmapMap {
  add(overlay: unknown): void
  remove(overlay: unknown): void
  clearMap?(): void
  setCenter(pos: [number, number]): void
  setZoom(zoom: number): void
  setFitView(overlays?: unknown[]): void
  on(event: string, cb: (e: { lnglat: AmapLngLat }) => void): void
  destroy(): void
}

export interface AmapOverlay {
  setPosition?(pos: [number, number]): void
  setCenter?(pos: [number, number]): void
  setRadius?(radius: number): void
  setPath?(path: Array<[number, number]>): void
}

export interface AmapNamespace {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => AmapMap
  Marker: new (opts: Record<string, unknown>) => AmapOverlay
  Circle: new (opts: Record<string, unknown>) => AmapOverlay
  Polyline: new (opts: Record<string, unknown>) => AmapOverlay
}

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string }
    AMap?: AmapNamespace
  }
}

const SCRIPT_ID = 'amap-js-api'

function loadScript(src: string): Promise<void> {
  const existing = document.getElementById(SCRIPT_ID)
  if (existing) existing.remove() // 换 key 后要重新加载
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('地图脚本加载失败（网络不通或 key 无效）'))
    document.head.appendChild(script)
  })
}

export interface UseAmap {
  mapEl: Ref<HTMLElement | null>
  ready: Ref<boolean>
  error: Ref<string | null>
  /** 用给定 key 初始化（重复调用会先销毁旧地图） */
  init(opts: {
    jsKey: string
    securityCode?: string
    /** 初始中心（GCJ-02）；默认给全国视野，由调用方按数据定位 */
    center?: [number, number]
    onReady?: (map: AmapMap) => void
  }): Promise<void>
  /** 拿到底层地图（画点画线用） */
  getMap(): AmapMap | null
  /** 拿到命名空间（构造 Marker/Polyline 用） */
  getNamespace(): AmapNamespace | null
  destroy(): void
}

export function useAmap(): UseAmap {
  const mapEl = ref<HTMLElement | null>(null)
  const ready = ref(false)
  const error = ref<string | null>(null)

  let map: AmapMap | null = null
  let namespace: AmapNamespace | null = null

  function destroy(): void {
    map?.destroy()
    map = null
    namespace = null
    ready.value = false
  }

  async function init(opts: {
    jsKey: string
    securityCode?: string
    center?: [number, number]
    onReady?: (map: AmapMap) => void
  }): Promise<void> {
    error.value = null
    destroy()

    const jsKey = opts.jsKey.trim()
    if (!jsKey) {
      error.value = '还没填「Web端(JS API)」key。填好并保存后地图才会出现；本页其它部分不受影响。'
      return
    }
    const el = mapEl.value
    if (!el) return

    try {
      const security = opts.securityCode?.trim()
      window._AMapSecurityConfig = security ? { securityJsCode: security } : undefined
      await loadScript(`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(jsKey)}`)
      const ns = window.AMap
      if (!ns) {
        error.value = '地图脚本加载了但没有暴露 AMap：多半是 key 无效或平台类型不对（要用「Web端(JS API)」）。'
        return
      }
      namespace = ns
      map = new ns.Map(el, { zoom: 13, center: opts.center ?? [104.2, 35.9], viewMode: '2D' })
      ready.value = true
      opts.onReady?.(map)
    } catch (err) {
      error.value = err instanceof Error
        ? `${err.message}。若控制台报 INVALID_USER_SCODE，说明这个 key 还需要「安全密钥」，在「位置」页里一并填写。`
        : '地图初始化失败'
    }
  }

  return { mapEl, ready, error, init, getMap: () => map, getNamespace: () => namespace, destroy }
}
