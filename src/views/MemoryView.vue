<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AppLayout from '@/components/common/AppLayout.vue'
import { fetchMemories, type MemoryFilter, type MemoryItem } from '@/api/memory.api'

/**
 * 记忆列表（只读）。
 *
 * 这一页只回答「它到底记了什么、有没有变好」——没有编辑、没有删除、没有手工归档。
 * 「被命中次数」与顶部两个汇总数字要等检索事件表落地（工单 02），
 * 后端在 `stats_available: false` 里明确说明，前端据此不渲染，而不是显示假的 0。
 */

const filterOptions: Array<{ label: string; value: MemoryFilter }> = [
  { label: '生效中', value: 'all' },
  { label: '状态型', value: 'state' },
  { label: '事件型', value: 'event' },
  { label: '已归档', value: 'archived' }
]

const PAGE_SIZE = 20

const filter = ref<MemoryFilter>('all')
const page = ref(1)
const items = ref<MemoryItem[]>([])
const total = ref(0)
const statsAvailable = ref(false)
const loading = ref(false)
const error = ref<string | null>(null)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))

function kindLabel(item: MemoryItem): string {
  if (item.kind === 'state') return '状态型'
  if (item.kind === 'event') return '事件型'
  return '未分类'
}

function kindClass(item: MemoryItem): string {
  return item.kind ? `memory-badge--${item.kind}` : 'memory-badge--plain'
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const res = await fetchMemories({ filter: filter.value, page: page.value, pageSize: PAGE_SIZE })
    items.value = res.items
    total.value = res.total
    statsAvailable.value = res.stats_available
  } catch (err) {
    error.value = (err as { response?: { data?: { error?: string } } }).response?.data?.error || '加载失败'
  } finally {
    loading.value = false
  }
}

function switchFilter(next: MemoryFilter): void {
  if (filter.value === next) return
  filter.value = next
  page.value = 1
  void load()
}

function goPage(next: number): void {
  if (next < 1 || next > totalPages.value) return
  page.value = next
  void load()
}

onMounted(load)
</script>

<template>
  <AppLayout>
    <div class="memory-page">
      <header class="memory-header">
        <h1 class="memory-header__title">记忆</h1>
        <p class="memory-header__hint">
          只读视图：这里是 Bot 长期记住的东西。状态型会被同主题新值取代（旧值归档），事件型长期未被命中后退场。
        </p>
      </header>

      <div class="memory-filters">
        <button
          v-for="opt in filterOptions" :key="opt.value"
          class="memory-filter" :class="{ 'memory-filter--active': filter === opt.value }"
          @click="switchFilter(opt.value)"
        >
          {{ opt.label }}
        </button>
        <span class="memory-count">共 {{ total }} 条</span>
      </div>

      <p v-if="statsAvailable === false" class="memory-note">
        命中次数与检索命中率还没接上（需要检索事件记录），所以这一页暂不显示它们。
      </p>

      <div v-if="loading" class="memory-empty">加载中...</div>
      <div v-else-if="error" class="memory-empty memory-empty--error">{{ error }}</div>
      <div v-else-if="items.length === 0" class="memory-empty">这一类下还没有记忆</div>

      <ul v-else class="memory-list">
        <li v-for="item in items" :key="item.id" class="memory-item">
          <div class="memory-item__head">
            <span class="memory-badge" :class="kindClass(item)">{{ kindLabel(item) }}</span>
            <span v-if="item.topic" class="memory-item__topic">{{ item.topic }}</span>
            <span class="memory-item__date">{{ item.memory_date }}</span>
            <span v-if="item.archived_at" class="memory-item__archived">
              已归档{{ item.superseded_by ? `（被 #${item.superseded_by} 取代）` : '（退场）' }}
            </span>
          </div>
          <p class="memory-item__content">{{ item.content }}</p>
        </li>
      </ul>

      <div v-if="totalPages > 1" class="memory-pager">
        <button class="memory-pager__btn" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
        <span class="memory-pager__label">{{ page }} / {{ totalPages }}</span>
        <button class="memory-pager__btn" :disabled="page >= totalPages" @click="goPage(page + 1)">下一页</button>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.memory-page { padding: 24px; max-width: 960px; }
.memory-header__title { margin: 0 0 4px; font-size: 1.25rem; }
.memory-header__hint { margin: 0 0 16px; color: var(--text-secondary); font-size: .875rem; line-height: 1.6; }
.memory-filters { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.memory-filter { padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border-subtle); background: transparent; cursor: pointer; color: var(--text-secondary); }
.memory-filter--active { border-color: var(--accent-primary); color: var(--text-primary); }
.memory-count { margin-left: auto; color: var(--text-muted); font-size: .8125rem; }
.memory-note { margin: 0 0 12px; padding: 8px 12px; border-radius: 6px; background: var(--bg-card); border: 1px solid var(--border-subtle); color: var(--text-secondary); font-size: .8125rem; }
.memory-empty { padding: 32px; text-align: center; color: var(--text-muted); }
.memory-empty--error { color: #ef4444; }
.memory-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.memory-item { padding: 10px 14px; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-card); }
.memory-item__head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.memory-item__topic { font-size: .8125rem; color: var(--text-primary); font-weight: 500; }
.memory-item__date { font-size: .75rem; color: var(--text-muted); margin-left: auto; }
.memory-item__archived { font-size: .75rem; color: var(--text-muted); }
.memory-item__content { margin: 0; font-size: .875rem; line-height: 1.6; color: var(--text-secondary); }
.memory-badge { font-size: .6875rem; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--border-subtle); }
.memory-badge--state { border-color: var(--accent-primary); }
.memory-badge--plain { color: var(--text-muted); }
.memory-pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 16px; }
.memory-pager__btn { padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border-subtle); background: transparent; cursor: pointer; }
.memory-pager__btn:disabled { opacity: .5; cursor: not-allowed; }
.memory-pager__label { color: var(--text-secondary); font-size: .8125rem; }
</style>
