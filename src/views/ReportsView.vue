<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchReports, type ReportType, type WeChatReport } from '@/api/reports.api'
import MarkdownPreview from '@/components/notes/MarkdownPreview.vue'

const typeOptions: Array<{ label: string; value: ReportType }> = [
  { label: '日报', value: 'daily' },
  { label: '周报', value: 'weekly' },
  { label: '月报', value: 'monthly' }
]

const activeType = ref<ReportType>('daily')
const reports = ref<WeChatReport[]>([])
const selected = ref<WeChatReport | null>(null)
const loading = ref(false)
// 下钻范围（父报告周期），空表示独立查询全部
const drillRange = ref<{ start: string; end: string } | null>(null)
const breadcrumb = ref<string[]>([])

function fmtBeijing(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}

function periodLabel(r: WeChatReport): string {
  const start = new Date(r.period_start).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const end = new Date(r.period_end).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const label = typeOptions.find(t => t.value === r.report_type)?.label || r.report_type
  return start === end ? `${label} ${start}` : `${label} ${start} ~ ${end}`
}

async function load() {
  loading.value = true
  try {
    reports.value = await fetchReports({
      type: activeType.value,
      ...(drillRange.value ? { start: drillRange.value.start, end: drillRange.value.end } : {})
    })
    selected.value = reports.value[0] ?? null
  } finally {
    loading.value = false
  }
}

function switchType(type: ReportType) {
  activeType.value = type
  drillRange.value = null
  breadcrumb.value = []
  load()
}

function select(r: WeChatReport) {
  selected.value = r
}

// 下钻：月报→周报 / 周报→日报
function drillDown(target: ReportType) {
  if (!selected.value) return
  drillRange.value = { start: selected.value.period_start, end: selected.value.period_end }
  breadcrumb.value = [periodLabel(selected.value)]
  activeType.value = target
  load()
}

function goUp() {
  breadcrumb.value = []
  drillRange.value = null
  load()
}

onMounted(load)
</script>

<template>
  <div class="reports-page">
    <div class="reports-tabs">
      <button
        v-for="opt in typeOptions" :key="opt.value"
        class="reports-tab" :class="{ 'reports-tab--active': activeType === opt.value }"
        @click="switchType(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>

    <div v-if="breadcrumb.length" class="reports-breadcrumb">
      <span class="reports-breadcrumb__item">{{ breadcrumb[0] }}</span>
      <span class="reports-breadcrumb__arrow">›</span>
      <button class="reports-breadcrumb__up" @click="goUp">返回全部</button>
    </div>

    <div class="reports-layout">
      <aside class="reports-list">
        <div v-if="loading" class="reports-empty">加载中...</div>
        <button
          v-for="r in reports" :key="r.id"
          class="reports-item" :class="{ 'reports-item--active': selected?.id === r.id }"
          @click="select(r)"
        >
          <span class="reports-item__period">{{ periodLabel(r) }}</span>
        </button>
        <div v-if="!loading && reports.length === 0" class="reports-empty">暂无报告</div>
      </aside>

      <section class="reports-detail">
        <template v-if="selected">
          <div class="reports-detail__header">
            <h2 class="reports-detail__title">{{ periodLabel(selected) }}</h2>
            <div class="reports-detail__actions">
              <button v-if="activeType === 'monthly'" class="reports-btn" @click="drillDown('weekly')">查看本月周报</button>
              <button v-if="activeType === 'weekly'" class="reports-btn" @click="drillDown('daily')">查看本周日报</button>
            </div>
          </div>
          <MarkdownPreview :content="selected.content" />
        </template>
        <div v-else class="reports-empty">请选择左侧报告查看详情</div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.reports-page { padding: 24px; }
.reports-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.reports-tab { padding: 8px 20px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-card); cursor: pointer; }
.reports-tab--active { background: var(--accent-primary); color: #fff; border-color: var(--accent-primary); }
.reports-breadcrumb { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: var(--text-secondary); font-size: .875rem; }
.reports-layout { display: grid; grid-template-columns: 260px 1fr; gap: 16px; align-items: start; }
.reports-list { display: flex; flex-direction: column; gap: 6px; max-height: calc(100vh - 200px); overflow-y: auto; }
.reports-item { text-align: left; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-card); cursor: pointer; }
.reports-item--active { border-color: var(--accent-primary); }
.reports-detail { border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-card); overflow: hidden; }
.reports-detail__header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); }
.reports-detail__title { font-size: 1.0625rem; margin: 0; }
.reports-btn { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-subtle); background: transparent; cursor: pointer; }
.reports-empty { padding: 24px; text-align: center; color: var(--text-muted); }
</style>
