<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppLayout from '@/components/common/AppLayout.vue'
import { settingsApi } from '@/api/settings.api'
import { fetchTrackDay, fetchTrackDays, type TrackDay } from '@/api/track.api'
import { useAmap, type AmapOverlay } from '@/composables/useAmap'
import { buildTrackOverlays } from '@/utils/trackOverlays'

/**
 * 轨迹回看：一天的路线与停留时间。
 *
 * 两条口径写死在页面上，免得人误读：
 * - **各区域时长按"越界"算**（家/公司待了多久看这个），停留段是切分器的产物，
 *   园区这种比 100 米大得多的地方会严重低估；
 * - **断档**是"真的没有定位数据"（手机没在采集），不是"停在某处不动"——正好用来判断采集是否被冻。
 */

const today = ref('')
const days = ref<string[]>([])
const date = ref('')
const day = ref<TrackDay | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

const amap = useAmap()
const { mapEl, ready: mapReady, error: mapError } = amap
let overlays: AmapOverlay[] = []

function bjNow(): Date {
  return new Date(Date.now() + 8 * 3600_000)
}

function bjToday(): string {
  return bjNow().toISOString().slice(0, 10)
}

/** UTC ISO → 北京钟点 HH:mm */
function hm(iso: string | null): string {
  if (!iso) return '--:--'
  return new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(11, 16)
}

function shiftDate(deltaDays: number): void {
  const next = new Date(Date.parse(`${date.value}T00:00:00Z`) + deltaDays * 86_400_000)
  date.value = next.toISOString().slice(0, 10)
}

function humanMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`
}

/** 时间轴：停留、行程、断档按时间顺序排一起 */
interface TimelineItem {
  kind: 'stay' | 'trip' | 'gap'
  at: string
  title: string
  detail: string
}

const timeline = computed<TimelineItem[]>(() => {
  if (!day.value) return []
  const items: TimelineItem[] = []

  for (const stay of day.value.stays) {
    items.push({
      kind: 'stay',
      at: stay.startedAt,
      title: stay.name ?? `停留（未命名 #${stay.placeId ?? '—'}）`,
      detail: `${hm(stay.startedAt)}–${hm(stay.endedAt)} · ${humanMinutes(stay.minutes)} · 半径 ${Math.round(stay.radiusM)} 米`
    })
  }
  for (const trip of day.value.trips) {
    items.push({
      kind: 'trip',
      at: trip.startedAt,
      title: `行程 ${(trip.distanceM / 1000).toFixed(2)} km`,
      detail: `${hm(trip.startedAt)}–${hm(trip.endedAt)} · ${humanMinutes(trip.minutes)}`
    })
  }
  for (const gap of day.value.gaps) {
    items.push({
      kind: 'gap',
      at: gap.from,
      title: '没有定位数据',
      detail: `${hm(gap.from)}–${hm(gap.to)} · ${humanMinutes(gap.minutes)}`
    })
  }

  return items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
})

const hasPath = computed(() => (day.value?.points.length ?? 0) > 1)

/** 丢了哪些、丢了多少，页面必须说清楚，不能让人以为这就是全部原始点 */
const droppedNote = computed(() => {
  const data = day.value
  if (!data) return ''
  const parts: string[] = []
  if (data.droppedLowAccuracy > 0) parts.push(`滤掉 ${data.droppedLowAccuracy} 个低精度点`)
  if (data.droppedDuplicates > 0) parts.push(`合并 ${data.droppedDuplicates} 个同秒重复点`)
  return parts.join('，')
})

async function loadDays(): Promise<void> {
  try {
    days.value = await fetchTrackDays()
  } catch {
    days.value = []
  }
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    day.value = await fetchTrackDay(date.value)
    drawTrack()
  } catch (err) {
    const status = (err as { response?: { status?: number } }).response?.status
    day.value = null
    error.value = status === 404 ? '还没有任何手机轨迹数据。' : '加载失败'
  } finally {
    loading.value = false
  }
}

function clearOverlays(): void {
  const instance = amap.getMap()
  if (instance) for (const overlay of overlays) instance.remove(overlay)
  overlays = []
}

function drawTrack(): void {
  const instance = amap.getMap()
  const ns = amap.getNamespace()
  const data = day.value
  if (!instance || !ns || !data) return

  clearOverlays()

  // 画什么由纯函数决定（可测），坐标一律是 GCJ-02 —— 见 utils/trackOverlays.ts
  for (const overlay of buildTrackOverlays(data)) {
    let shape: AmapOverlay
    if (overlay.kind === 'path') {
      shape = new ns.Polyline({
        path: overlay.path,
        strokeColor: '#2563eb',
        strokeWeight: 4,
        strokeOpacity: 0.85,
        lineJoin: 'round'
      })
    } else if (overlay.kind === 'region') {
      shape = new ns.Circle({
        center: overlay.center,
        radius: overlay.radius,
        strokeColor: '#f59e0b',
        strokeWeight: 2,
        strokeStyle: 'dashed',
        fillColor: '#f59e0b',
        fillOpacity: 0.08
      })
    } else if (overlay.kind === 'stay') {
      shape = new ns.Circle({
        center: overlay.center,
        radius: overlay.radius,
        strokeColor: '#0ea5e9',
        strokeWeight: 2,
        fillColor: '#0ea5e9',
        fillOpacity: 0.18
      })
    } else {
      const isRegion = overlay.kind === 'region-label'
      shape = new ns.Marker({
        position: overlay.center,
        content: isRegion
          ? `<div style="color:#b45309;font-size:12px">${overlay.text}</div>`
          : `<div style="background:rgba(14,165,233,.92);color:#fff;padding:2px 8px;border-radius:10px;font-size:12px;white-space:nowrap">${overlay.text}</div>`,
        anchor: 'bottom-center'
      })
    }
    overlays.push(shape)
    instance.add(shape)
  }

  if (overlays.length > 0) instance.setFitView(overlays)
}

async function initMap(): Promise<void> {
  let jsKey = ''
  let securityCode = ''
  try {
    const { data } = await settingsApi.getAll()
    const bag = data as unknown as Record<string, unknown>
    jsKey = typeof bag.amap_js_key === 'string' ? bag.amap_js_key : ''
    securityCode = typeof bag.amap_js_security === 'string' ? bag.amap_js_security : ''
  } catch {
    // 读不到 key 只是没地图，时间轴照常
  }
  await amap.init({ jsKey, securityCode })
  drawTrack()
}

onMounted(async () => {
  today.value = bjToday()
  date.value = today.value
  await Promise.all([loadDays(), load()])
  // 数据到位、容器已渲染之后再初始化地图，避免与渲染抢时序
  await initMap()
})

onBeforeUnmount(() => {
  amap.destroy()
})

watch(date, () => {
  void load()
})
</script>

<template>
  <AppLayout>
    <div class="track">
      <header class="track__header">
        <div class="track__date">
          <button class="btn" @click="shiftDate(-1)">‹ 前一天</button>
          <input v-model="date" type="date" class="track__date-input" />
          <button class="btn" :disabled="date >= today" @click="shiftDate(1)">后一天 ›</button>
          <span v-if="date === today" class="track__today">今天</span>
        </div>
        <div class="track__days">
          <span class="muted">有数据：</span>
          <button
            v-for="d in days"
            :key="d"
            :class="['chip', d === date ? 'chip--active' : '']"
            @click="date = d"
          >{{ d.slice(5) }}</button>
          <span v-if="days.length === 0" class="muted">（无）</span>
        </div>
      </header>

      <p v-if="loading" class="muted">加载中…</p>
      <p v-if="error" class="notice">{{ error }}</p>

      <!-- 汇总与时间轴依赖数据；地图容器**不能**放在 v-if 里：
           initMap 与 load 并行，容器若还没渲染出来，地图就再也不会被创建（静默空白）。 -->
      <section v-if="day" class="totals">
        <div class="totals__item">
          <span class="totals__label">里程</span>
          <span class="totals__value">{{ day.totals.distanceKm.toFixed(1) }} km</span>
        </div>
        <div class="totals__item totals__item--wide">
          <span class="totals__label">各区域时长（按越界判定）</span>
          <span class="totals__value">
            <template v-if="day.totals.byRegion.length === 0">（当天没进出过划定的区域）</template>
            <template v-else>
              <span v-for="region in day.totals.byRegion" :key="region.placeId" class="totals__region">
                {{ region.name }} {{ humanMinutes(region.minutes) }}
                <em v-if="region.ongoing">（进行中，{{ hm(region.since) }} 起）</em>
              </span>
            </template>
          </span>
        </div>
        <div class="totals__item">
          <span class="totals__label">首末定位</span>
          <span class="totals__value">{{ hm(day.totals.firstFixAt) }} – {{ hm(day.totals.lastFixAt) }}</span>
        </div>
        <div class="totals__item">
          <span class="totals__label">点数</span>
          <span class="totals__value">
            {{ day.points.length }}
            <em v-if="droppedNote" class="totals__note">（{{ droppedNote }}）</em>
          </span>
        </div>
      </section>

      <div class="track__body">
        <aside v-if="day" class="timeline">
          <h3>时间轴</h3>
          <p v-if="timeline.length === 0" class="muted">这天没有停留、行程或断档记录。</p>
          <ul>
            <li v-for="(item, index) in timeline" :key="index" :class="['timeline__item', `timeline__item--${item.kind}`]">
              <span class="timeline__title">{{ item.title }}</span>
              <span class="muted">{{ item.detail }}</span>
            </li>
          </ul>
        </aside>

        <section class="map">
          <div ref="mapEl" class="map__canvas" />
          <p v-if="mapError" class="map__error">{{ mapError }}</p>
          <p v-else-if="day && !hasPath" class="map__empty">这天没有可画的轨迹点。</p>
        </section>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.track {
  padding: 24px;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.track__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.track__date {
  display: flex;
  align-items: center;
  gap: 8px;
}

.track__date-input {
  padding: 6px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
}

.track__today {
  font-size: 12px;
  color: var(--accent-primary);
}

.track__days {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: 12px;
}

.chip {
  border: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-secondary);
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
}

.chip--active {
  border-color: var(--accent-primary);
  color: #fff;
  background: var(--accent-primary);
}

.totals {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
}

.totals__item {
  display: grid;
  gap: 2px;
}

.totals__item--wide {
  grid-column: span 2;
}

.totals__label {
  font-size: 12px;
  color: var(--text-muted);
}

.totals__value {
  font-size: 15px;
  color: var(--text-primary);
}

.totals__region {
  margin-right: 12px;
  white-space: nowrap;
}

.totals__note {
  font-size: 12px;
  color: var(--text-muted);
  font-style: normal;
}

.track__body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
}

.timeline {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 12px;
  overflow: auto;
}

.timeline h3 {
  margin: 0 0 8px;
  font-size: 14px;
}

.timeline ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.timeline__item {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  border-left: 3px solid transparent;
  font-size: 13px;
}

.timeline__item--stay {
  border-left-color: #0ea5e9;
  background: rgba(14, 165, 233, 0.08);
}

.timeline__item--trip {
  border-left-color: #2563eb;
  background: rgba(37, 99, 235, 0.07);
}

.timeline__item--gap {
  border-left-color: var(--border-subtle);
  background: rgba(148, 163, 184, 0.12);
}

.timeline__title {
  color: var(--text-primary);
}

.map {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  min-height: 380px;
}

.map__canvas {
  width: 100%;
  height: 100%;
  min-height: 380px;
}

.map__error,
.map__empty {
  position: absolute;
  inset: auto 12px 12px 12px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.86);
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
  background: rgba(220, 38, 38, 0.12);
  color: var(--text-primary);
  font-size: 13px;
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

@media (max-width: 1100px) {
  .track__body {
    grid-template-columns: 1fr;
  }
  .totals__item--wide {
    grid-column: span 1;
  }
}
</style>
