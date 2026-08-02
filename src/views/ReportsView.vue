<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppLayout from '@/components/common/AppLayout.vue'
import { fetchReports, updateReport, deleteReport, type ReportType, type WeChatReport } from '@/api/reports.api'
import MarkdownPreview from '@/components/notes/MarkdownPreview.vue'

const typeOptions: Array<{ label: string; value: ReportType }> = [
  { label: '日报', value: 'daily' },
  { label: '周报', value: 'weekly' },
  { label: '月报', value: 'monthly' }
]

// 搜索筛选：类型（''=全部）+ 开始/结束日期（北京时间 YYYY-MM-DD）
const type = ref<'' | ReportType>('')
const startDate = ref('')
const endDate = ref('')
const reports = ref<WeChatReport[]>([])
const selected = ref<WeChatReport | null>(null)
const loading = ref(false)
const breadcrumb = ref<string[]>([])
// 编辑 / 删除
const editing = ref(false)
const editContent = ref('')
const saving = ref(false)

/** 北京时区 YYYY-MM-DD → UTC ISO。inclusiveEnd=true 时含当天（取次日北京 00:00 作为排他上界）。 */
function beijingDateToUtcIso(dateStr: string, inclusiveEnd: boolean): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  if (inclusiveEnd) d.setUTCDate(d.getUTCDate() + 1)
  // 北京 00:00 = UTC 前一天的 16:00
  return new Date(d.getTime() - 8 * 3600 * 1000).toISOString()
}

/** UTC ISO → 北京日期 YYYY-MM-DD。 */
function isoToBeijingDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

function buildRange(): { start?: string; end?: string } {
  const range: { start?: string; end?: string } = {}
  if (startDate.value) range.start = beijingDateToUtcIso(startDate.value, false)
  if (endDate.value) range.end = beijingDateToUtcIso(endDate.value, true)
  return range
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
      type: type.value || undefined,
      ...buildRange()
    })
    selected.value = reports.value[0] ?? null
    editing.value = false
  } finally {
    loading.value = false
  }
}

function applySearch() {
  breadcrumb.value = []
  load()
}

function resetSearch() {
  type.value = ''
  startDate.value = ''
  endDate.value = ''
  breadcrumb.value = []
  load()
}

function select(r: WeChatReport) {
  selected.value = r
}

// 下钻：月报→周报 / 周报→日报。把父报告周期填入搜索表单（类型 + 起止日期）。
function drillDown(target: ReportType) {
  if (!selected.value) return
  type.value = target
  startDate.value = isoToBeijingDate(selected.value.period_start)
  endDate.value = isoToBeijingDate(selected.value.period_end)
  breadcrumb.value = [periodLabel(selected.value)]
  load()
}

function startEdit() {
  if (!selected.value) return
  editContent.value = selected.value.content
  editing.value = true
}

function cancelEdit() {
  editing.value = false
}

async function saveEdit() {
  if (!selected.value || saving.value) return
  saving.value = true
  try {
    const updated = await updateReport(selected.value.id, editContent.value)
    selected.value = updated
    editing.value = false
    await load()
  } catch (err) {
    console.error('保存报告失败:', err)
  } finally {
    saving.value = false
  }
}

async function removeSelected() {
  if (!selected.value) return
  if (!window.confirm('确定删除该报告吗？删除后不可恢复。')) return
  try {
    await deleteReport(selected.value.id)
    await load()
  } catch (err) {
    console.error('删除报告失败:', err)
  }
}

onMounted(load)
</script>

<template>
  <AppLayout>
    <div class="reports-page">
      <div class="reports-search">
        <select v-model="type" class="reports-search__select" @change="applySearch">
          <option value="">全部类型</option>
          <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
        <label class="reports-search__label">开始</label>
        <input v-model="startDate" type="date" class="reports-search__date" />
        <label class="reports-search__label">结束</label>
        <input v-model="endDate" type="date" class="reports-search__date" />
        <button class="reports-btn reports-btn--primary" @click="applySearch">查询</button>
        <button v-if="type || startDate || endDate" class="reports-btn" @click="resetSearch">重置</button>
      </div>

      <div v-if="breadcrumb.length" class="reports-breadcrumb">
        <span class="reports-breadcrumb__item">{{ breadcrumb[0] }}</span>
        <span class="reports-breadcrumb__arrow">›</span>
        <button class="reports-breadcrumb__up" @click="resetSearch">返回全部</button>
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
                <button v-if="selected.report_type === 'monthly'" class="reports-btn" @click="drillDown('weekly')">查看本月周报</button>
                <button v-if="selected.report_type === 'weekly'" class="reports-btn" @click="drillDown('daily')">查看本周日报</button>
                <template v-if="!editing">
                  <button class="reports-btn" @click="startEdit">编辑</button>
                  <button class="reports-btn reports-btn--danger" @click="removeSelected">删除</button>
                </template>
              </div>
            </div>
            <template v-if="editing">
              <textarea
                v-model="editContent"
                class="reports-detail__editor"
                rows="16"
                placeholder="编辑报告内容（markdown）"
              />
              <div class="reports-detail__footer">
                <button class="reports-btn" :disabled="saving" @click="cancelEdit">取消</button>
                <button class="reports-btn reports-btn--primary" :disabled="saving" @click="saveEdit">
                  {{ saving ? '保存中...' : '保存' }}
                </button>
              </div>
            </template>
            <MarkdownPreview v-else :content="selected.content" />
          </template>
          <div v-else class="reports-empty">请选择左侧报告查看详情</div>
        </section>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.reports-page { padding: 24px; }
.reports-breadcrumb { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: var(--text-secondary); font-size: .875rem; }
.reports-layout { display: grid; grid-template-columns: 260px 1fr; gap: 16px; align-items: start; }
.reports-list { display: flex; flex-direction: column; gap: 6px; max-height: calc(100vh - 200px); overflow-y: auto; }
.reports-item { text-align: left; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-card); cursor: pointer; }
.reports-item--active { border-color: var(--accent-primary); }
.reports-detail { border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-card); overflow: hidden; }
.reports-detail__header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); }
.reports-detail__title { font-size: 1.0625rem; margin: 0; }
.reports-btn { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-subtle); background: transparent; cursor: pointer; }
.reports-btn--primary { background: var(--accent-primary); border-color: var(--accent-primary); color: #fff; }
.reports-btn--danger { color: #ef4444; border-color: rgba(239, 68, 68, 0.35); }
.reports-btn--danger:hover { background: rgba(239, 68, 68, 0.08); }
.reports-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.reports-empty { padding: 24px; text-align: center; color: var(--text-muted); }
.reports-search { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.reports-search__label { color: var(--text-secondary); font-size: 0.875rem; }
.reports-search__select,
.reports-search__date {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.875rem;
}
.reports-search__select:focus,
.reports-search__date:focus { outline: none; border-color: var(--accent-primary); }
.reports-detail__editor {
  width: 100%;
  box-sizing: border-box;
  padding: 16px;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.875rem;
  line-height: 1.7;
  resize: vertical;
}
.reports-detail__editor:focus { outline: none; }
.reports-detail__footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--border-subtle); }
</style>
