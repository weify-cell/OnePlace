<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppLayout from '@/components/common/AppLayout.vue'
import { settingsApi } from '@/api/settings.api'
import { createPlace, fetchPlaces, updatePlace, type PlaceItem } from '@/api/locations.api'

/**
 * 位置与区域：在地图上划定「家」「公司」这类范围。
 *
 * 为什么要有这一页：轨迹本身只给出坐标，判定"到家了"需要**人指定**哪个范围算家
 * （见 ADR-0004：区域 = 有手工名字的地点，靠越界判定，越界后持续 2 分钟才算）。
 *
 * 这一页只做圆的表达：圆心用点击地图设置，大小用滑块。多边形是另一个量级的复杂度，
 * 而家/公司一个 150–300 米的圆足够。
 *
 * 没填「Web端(JS API)」key 时不白屏：列表照常能看能改，地图位置给出明确指引。
 */

// ── 高德 JS API 的最小类型（只声明用得到的部分，不为一个地图页引整包类型）────────
interface AmapLngLat {
  getLng(): number
  getLat(): number
}
interface AmapMap {
  add(overlay: unknown): void
  remove(overlay: unknown): void
  setCenter(pos: [number, number]): void
  setZoom(zoom: number): void
  setFitView(overlays?: unknown[]): void
  on(event: string, cb: (e: { lnglat: AmapLngLat }) => void): void
  destroy(): void
}
interface AmapOverlay {
  setPosition?(pos: [number, number]): void
  setCenter?(pos: [number, number]): void
  setRadius?(radius: number): void
}
interface AmapNamespace {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => AmapMap
  Marker: new (opts: Record<string, unknown>) => AmapOverlay
  Circle: new (opts: Record<string, unknown>) => AmapOverlay
}

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string }
    AMap?: AmapNamespace
  }
}

const KEY_SERVICE = 'amap_key'
const KEY_JS = 'amap_js_key'
const KEY_SECURITY = 'amap_js_security'

const places = ref<PlaceItem[]>([])
const deviceId = ref<string | null>(null)
const selectedId = ref<number | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const message = ref<string | null>(null)

const serviceKey = ref('')
const jsKey = ref('')
const securityCode = ref('')
const showSettings = ref(false)
const savingKeys = ref(false)

// 地图
const mapEl = ref<HTMLElement | null>(null)
const mapError = ref<string | null>(null)
const mapReady = ref(false)
let map: AmapMap | null = null
let markers: AmapOverlay[] = []
let circle: AmapOverlay | null = null

// 编辑中的区域（未保存前不动服务端）
const draftName = ref('')
const draftRadius = ref(200)
const draftLat = ref(0)
const draftLon = ref(0)
const saving = ref(false)

// 新建区域
const creating = ref(false)
const newName = ref('')
const newPoint = ref<{ lat: number; lon: number } | null>(null)

const selected = computed(() => places.value.find(p => p.id === selectedId.value) ?? null)
const hasDevice = computed(() => deviceId.value !== null)

function placeLabel(place: PlaceItem): string {
  if (place.name) return place.name
  if (place.geo?.poiName) return `${place.geo.poiName}（未划定）`
  return `未命名地点 #${place.id}`
}

function placeSubLabel(place: PlaceItem): string {
  const parts: string[] = []
  if (place.geo?.district) parts.push(place.geo.district)
  parts.push(`半径 ${Math.round(place.radiusM)} 米`)
  if (place.hitCount > 0) parts.push(`到过 ${place.hitCount} 次`)
  return parts.join(' · ')
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const res = await fetchPlaces()
    places.value = res.places
    deviceId.value = res.device_id
    if (selectedId.value && !places.value.some(p => p.id === selectedId.value)) selectedId.value = null
  } catch (err) {
    error.value = (err as { response?: { data?: { error?: string } } }).response?.data?.error || '加载地点失败'
  } finally {
    loading.value = false
  }
}

async function loadKeys(): Promise<void> {
  try {
    const { data } = await settingsApi.getAll()
    const bag = data as Record<string, unknown>
    serviceKey.value = typeof bag[KEY_SERVICE] === 'string' ? bag[KEY_SERVICE] : ''
    jsKey.value = typeof bag[KEY_JS] === 'string' ? bag[KEY_JS] : ''
    securityCode.value = typeof bag[KEY_SECURITY] === 'string' ? bag[KEY_SECURITY] : ''
  } catch {
    // 读不到 key 不算错误：列表仍然可用，地图位置会给指引
  }
}

async function saveKeys(): Promise<void> {
  savingKeys.value = true
  message.value = null
  try {
    await Promise.all([
      settingsApi.set(KEY_SERVICE, serviceKey.value.trim()),
      settingsApi.set(KEY_JS, jsKey.value.trim()),
      settingsApi.set(KEY_SECURITY, securityCode.value.trim())
    ])
    message.value = '已保存；地图会重新加载'
    await load()
    await initMap()
  } catch {
    message.value = '保存失败'
  } finally {
    savingKeys.value = false
  }
}

function select(place: PlaceItem): void {
  selectedId.value = place.id
  creating.value = false
  draftName.value = place.name ?? ''
  draftRadius.value = Math.round(place.radiusM)
  // 地图上的一律是 GCJ-02（与服务端存的 WGS-84 差 500 米，混用会画歪）
  draftLat.value = place.gcjLat
  draftLon.value = place.gcjLon
  drawOverlays()
  if (map) map.setCenter([place.gcjLon, place.gcjLat])
}

function beginCreate(): void {
  creating.value = true
  selectedId.value = null
  newPoint.value = null
  newName.value = ''
  message.value = '在地图上点一下作为圆心，然后起个名字'
}

async function saveSelected(): Promise<void> {
  if (!selected.value) return
  saving.value = true
  message.value = null
  try {
    await updatePlace(selected.value.id, {
      name: draftName.value,
      radiusM: draftRadius.value,
      coord: { lat: draftLat.value, lon: draftLon.value }
    })
    await load()
    drawOverlays()
    const after = places.value.find(p => p.id === selectedId.value)
    message.value = after?.isRegion
      ? `「${after.name}」已划定：以后越出这个范围持续 2 分钟就算离开`
      : '已保存'
  } catch (err) {
    message.value = (err as { response?: { data?: { error?: string } } }).response?.data?.error || '保存失败'
  } finally {
    saving.value = false
  }
}

async function clearRegion(): Promise<void> {
  if (!selected.value) return
  saving.value = true
  try {
    await updatePlace(selected.value.id, { name: '' })
    await load()
    draftName.value = ''
    drawOverlays()
    message.value = '已取消划定（地点本身保留）'
  } finally {
    saving.value = false
  }
}

async function confirmCreate(): Promise<void> {
  if (!newPoint.value) {
    message.value = '先在地图上点一下位置'
    return
  }
  saving.value = true
  try {
    const res = await createPlace({
      name: newName.value.trim(),
      coord: { lat: newPoint.value.lat, lon: newPoint.value.lon },
      radiusM: draftRadius.value
    })
    await load()
    creating.value = false
    newPoint.value = null
    newName.value = ''
    const created = places.value.find(p => p.id === res.place.id)
    if (created) select(created)
    message.value = res.merged ? '那附近已有一处地点，已直接给它起名' : '已新建'
  } catch (err) {
    message.value = (err as { response?: { data?: { error?: string } } }).response?.data?.error || '新建失败'
  } finally {
    saving.value = false
  }
}

// ── 地图 ────────────────────────────────────────────────────────────────────
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('地图脚本加载失败（网络不通或 key 无效）'))
    document.head.appendChild(script)
  })
}

function drawOverlays(): void {
  if (!map || !window.AMap) return
  for (const marker of markers) map.remove(marker)
  markers = []

  for (const place of places.value) {
    const marker = new window.AMap.Marker({
      position: [place.gcjLon, place.gcjLat],
      title: placeLabel(place),
      // 已划定区域用不同颜色，一眼能分出"哪些是家/公司"
      content: place.isRegion
        ? `<div style="background:#2563eb;color:#fff;padding:2px 8px;border-radius:10px;font-size:12px;white-space:nowrap">${place.name}</div>`
        : `<div style="background:#fff;border:1px solid #cbd5e1;color:#334155;padding:2px 8px;border-radius:10px;font-size:12px;white-space:nowrap">${placeLabel(place)}</div>`,
      offset: undefined,
      anchor: 'bottom-center'
    })
    markers.push(marker)
    map.add(marker)
  }

  if (circle) {
    map.remove(circle)
    circle = null
  }
  if (selectedId.value) {
    circle = new window.AMap.Circle({
      center: [draftLon.value, draftLat.value],
      radius: draftRadius.value,
      strokeColor: '#2563eb',
      strokeWeight: 2,
      fillColor: '#2563eb',
      fillOpacity: 0.15
    })
    map.add(circle)
  }
}

async function initMap(): Promise<void> {
  mapError.value = null
  mapReady.value = false
  if (map) {
    map.destroy()
    map = null
    markers = []
    circle = null
  }
  if (!jsKey.value.trim()) {
    mapError.value = '还没填「Web端(JS API)」key。可以点右上角「高德 key」填写，或在设置页填；列表部分不受影响。'
    return
  }
  const el = mapEl.value
  if (!el) return

  try {
    window._AMapSecurityConfig = securityCode.value.trim()
      ? { securityJsCode: securityCode.value.trim() }
      : undefined
    await loadScript(`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(jsKey.value.trim())}`)
    const ns = window.AMap
    if (!ns) {
      mapError.value = '地图脚本加载了，但没有暴露 AMap：多半是 key 无效或平台类型不对（要用「Web端(JS API)」）。'
      return
    }
    const center: [number, number] = places.value.length > 0
      ? [places.value[0].gcjLon, places.value[0].gcjLat]
      : [116.397, 39.909]
    map = new ns.Map(el, { zoom: 13, center, viewMode: '2D' })
    map.on('click', (e) => {
      const lon = e.lnglat.getLng()
      const lat = e.lnglat.getLat()
      if (creating.value) {
        newPoint.value = { lat, lon }
        message.value = '位置已选，填个名字就能创建'
        return
      }
      if (selectedId.value) {
        draftLat.value = lat
        draftLon.value = lon
        circle?.setCenter?.([lon, lat])
        message.value = '圆心已移动，记得点「保存」'
      }
    })
    mapReady.value = true
    drawOverlays()
    if (places.value.length > 1) map.setFitView(markers)
  } catch (err) {
    mapError.value = err instanceof Error
      ? `${err.message}。如果控制台报 INVALID_USER_SCODE，说明这个 key 还需要「安全密钥」，在下面一并填写。`
      : '地图初始化失败'
  }
}

onMounted(async () => {
  await loadKeys()
  await load()
  await initMap()
})

onBeforeUnmount(() => {
  map?.destroy()
  map = null
})
</script>

<template>
  <AppLayout>
    <div class="locations">
      <header class="locations__header">
        <div>
          <h1>位置与区域</h1>
          <p class="locations__hint">
            划定「家」「公司」的范围后，机器人靠<strong>越界</strong>判断到达与离开
            （越界后持续 2 分钟才算，避免在边界上反复横跳），不再需要"待够 10 分钟"。
          </p>
        </div>
        <button class="btn btn--ghost" @click="showSettings = !showSettings">
          {{ showSettings ? '收起高德 key' : '高德 key' }}
        </button>
      </header>

      <section v-if="showSettings" class="keys">
        <label>
          <span>Web 服务 key（服务端逆地理编码用，如"这是哪")  </span>
          <input v-model="serviceKey" type="text" placeholder="服务端查地名用" />
        </label>
        <label>
          <span>Web端(JS API) key（本页地图用）</span>
          <input v-model="jsKey" type="text" placeholder="地图必须用这一种类型的 key" />
        </label>
        <label>
          <span>安全密钥 securityJsCode（地图报 INVALID_USER_SCODE 时填）</span>
          <input v-model="securityCode" type="text" placeholder="可留空" />
        </label>
        <div class="keys__actions">
          <button class="btn btn--primary" :disabled="savingKeys" @click="saveKeys">保存并重载地图</button>
          <span class="muted">两个 key 类型不同，不能混用；key 存在服务端设置里。</span>
        </div>
      </section>

      <p v-if="message" class="notice">{{ message }}</p>
      <p v-if="error" class="notice notice--error">{{ error }}</p>

      <div class="locations__body">
        <aside class="list">
          <div class="list__head">
            <span>地点（{{ places.length }}）</span>
            <button class="btn btn--small" :disabled="!mapReady" @click="beginCreate">划定新区域</button>
          </div>
          <p v-if="loading" class="muted">加载中…</p>
          <p v-else-if="!hasDevice" class="muted">还没有手机轨迹数据。</p>
          <p v-else-if="places.length === 0" class="muted">还没有识别到任何地点。</p>
          <ul v-else>
            <li
              v-for="place in places"
              :key="place.id"
              :class="['list__item', place.id === selectedId ? 'list__item--active' : '']"
              @click="select(place)"
            >
              <div class="list__title">
                <span>{{ placeLabel(place) }}</span>
                <span v-if="place.isRegion" class="badge">区域</span>
              </div>
              <div class="muted">{{ placeSubLabel(place) }}</div>
            </li>
          </ul>
        </aside>

        <section class="panel">
          <div v-if="creating" class="editor">
            <h3>划定新区域</h3>
            <p class="muted">在地图上点一下作为圆心（{{ newPoint ? '已选' : '未选' }}），再起名。</p>
            <input v-model="newName" placeholder="名字，例如：公司" />
            <label class="editor__row">
              <span>半径 {{ draftRadius }} 米</span>
              <input v-model.number="draftRadius" type="range" min="50" max="2000" step="10" />
            </label>
            <div class="editor__actions">
              <button class="btn btn--primary" :disabled="saving" @click="confirmCreate">创建</button>
              <button class="btn btn--ghost" @click="creating = false">取消</button>
            </div>
          </div>

          <div v-else-if="selected" class="editor">
            <h3>{{ selected.name ? '调整区域' : '划定这个地点' }}</h3>
            <p class="muted">
              {{ selected.geo?.address || '（还没有地址信息）' }}
            </p>
            <input v-model="draftName" placeholder="名字，例如：家" />
            <label class="editor__row">
              <span>半径 {{ draftRadius }} 米</span>
              <input v-model.number="draftRadius" type="range" min="50" max="2000" step="10" />
            </label>
            <p class="muted">
              圆心（地图坐标）{{ draftLat.toFixed(5) }}, {{ draftLon.toFixed(5) }} —— 在地图上点一下即可移动
            </p>
            <div class="editor__actions">
              <button class="btn btn--primary" :disabled="saving" @click="saveSelected">保存</button>
              <button v-if="selected.isRegion" class="btn btn--ghost" :disabled="saving" @click="clearRegion">
                取消划定
              </button>
            </div>
          </div>

          <div v-else class="editor editor--empty">
            <p class="muted">左边选一个地点来划定范围，或点「划定新区域」。</p>
          </div>
        </section>

        <div class="map">
          <div ref="mapEl" class="map__canvas" />
          <p v-if="mapError" class="map__error">{{ mapError }}</p>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.locations {
  padding: 24px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.locations__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.locations__header h1 {
  margin: 0 0 6px;
  font-size: 20px;
}

.locations__hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  max-width: 720px;
  line-height: 1.6;
}

.keys {
  display: grid;
  gap: 10px;
  padding: 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
}

.keys label {
  display: grid;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}

.keys input {
  padding: 8px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: var(--bg-primary, transparent);
  color: var(--text-primary);
  font-family: inherit;
}

.keys__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.locations__body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px 300px 1fr;
  gap: 16px;
}

.list,
.panel {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 12px;
  overflow: auto;
}

.list__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-secondary);
}

.list ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.list__item {
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}

.list__item:hover {
  background: var(--bg-hover, rgba(148, 163, 184, 0.12));
}

.list__item--active {
  background: rgba(37, 99, 235, 0.12);
}

.list__title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-primary);
}

.badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(37, 99, 235, 0.15);
  color: var(--accent-primary);
}

.editor {
  display: grid;
  gap: 10px;
}

.editor h3 {
  margin: 0;
  font-size: 15px;
}

.editor input[type='text'],
.editor input:not([type]) {
  padding: 8px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
}

.editor__row {
  display: grid;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.editor__actions {
  display: flex;
  gap: 8px;
}

.editor--empty {
  height: 100%;
  place-content: center;
  text-align: center;
}

.map {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  min-height: 360px;
}

.map__canvas {
  width: 100%;
  height: 100%;
  min-height: 360px;
}

.map__error {
  position: absolute;
  inset: auto 12px 12px 12px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.88);
  color: #f8fafc;
  font-size: 12px;
  line-height: 1.6;
}

.muted {
  color: var(--text-muted);
  font-size: 12px;
  margin: 0;
}

.notice {
  margin: 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(37, 99, 235, 0.1);
  color: var(--text-primary);
  font-size: 13px;
}

.notice--error {
  background: rgba(220, 38, 38, 0.12);
}

.btn {
  border: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-primary);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--primary {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: #fff;
}

.btn--small {
  padding: 3px 8px;
  font-size: 12px;
}

@media (max-width: 1100px) {
  .locations__body {
    grid-template-columns: 1fr;
  }
}
</style>
