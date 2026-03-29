<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import type { Change } from 'diff'

const props = defineProps<{
  diffs: Change[]
  currentIndex: number
}>()

const emit = defineEmits<{
  navigate: [index: number]
}>()

const panelRef = ref<HTMLElement>()

// 为每个差异项计算位置信息
interface DiffItem {
  index: number
  value: string
  type: 'added' | 'removed' | 'unchanged'
  isDiff: boolean
}

const diffItems = computed<DiffItem[]>(() => {
  return props.diffs.map((change, index) => ({
    index,
    value: change.value,
    type: change.added ? 'added' : change.removed ? 'removed' : 'unchanged',
    isDiff: change.added || change.removed
  }))
})

// 高亮差异的索引列表
const diffIndices = computed(() => {
  return props.diffs
    .map((change, index) => (change.added || change.removed ? index : -1))
    .filter(index => index !== -1)
})

// 当前差异位置
const currentDiffIndices = computed(() => {
  if (props.currentIndex < 0 || props.currentIndex >= diffIndices.value.length) {
    return -1
  }
  return diffIndices.value[props.currentIndex]
})

// 滚动到当前差异
watch(currentDiffIndices, async (newIndex) => {
  if (newIndex < 0) return
  await nextTick()
  const el = panelRef.value?.querySelector(`[data-diff-index="${newIndex}"]`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
})

function onDiffClick(item: DiffItem) {
  if (!item.isDiff) return
  const idx = diffIndices.value.indexOf(item.index)
  if (idx >= 0) {
    emit('navigate', idx)
  }
}
</script>

<template>
  <div ref="panelRef" class="diff-result-panel">
    <div v-if="diffItems.length === 0" class="empty-state">
      请在两侧输入文本进行比较
    </div>
    <div v-else class="diff-content">
      <span
        v-for="item in diffItems"
        :key="item.index"
        :data-diff-index="item.isDiff ? item.index : undefined"
        :class="[
          'diff-char',
          {
            'diff-added': item.type === 'added',
            'diff-removed': item.type === 'removed',
            'diff-active': item.isDiff && currentDiffIndices === item.index,
            'diff-clickable': item.isDiff
          }
        ]"
        @click="onDiffClick(item)"
      >{{ item.value }}</span>
    </div>
  </div>
</template>

<style scoped>
.diff-result-panel {
  height: 100%;
  overflow: auto;
  padding: 12px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--n-color);
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--n-text-color-3);
  font-size: 14px;
}

.diff-content {
  min-height: 100%;
}

.diff-char {
  display: inline;
}

.diff-added {
  background-color: #d4edda;
  color: #155724;
  border-radius: 2px;
  padding: 0 1px;
}

.diff-removed {
  background-color: #f8d7da;
  color: #721c24;
  text-decoration: line-through;
  border-radius: 2px;
  padding: 0 1px;
}

.diff-active {
  outline: 2px solid #007bff;
  outline-offset: -2px;
}

.diff-clickable {
  cursor: pointer;
}

.diff-clickable:hover {
  opacity: 0.8;
}
</style>
