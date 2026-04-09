<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMessage } from 'naive-ui'
import ToolLayout from '@/components/toolbox/ToolLayout.vue'
import InlineDiffEditor from '@/components/toolbox/InlineDiffEditor.vue'
import { computeLineDiff, generateLineDiffReport, getTextLengthStatus, type DiffLine, type LineDiffResult } from '@/utils/text-diff'

const message = useMessage()

const originalText = ref('')
const compareText = ref('')
const diffResult = ref<LineDiffResult | null>(null)
const isComputing = ref(false)
const isHighlighted = ref(false)

const originalLengthStatus = computed(() => getTextLengthStatus(originalText.value.length))
const compareLengthStatus = computed(() => getTextLengthStatus(compareText.value.length))

const diffStats = computed(() => {
  if (!diffResult.value) {
    return { deletions: 0, additions: 0 }
  }
  return diffResult.value.stats
})

const leftDiffLines = computed<DiffLine[]>(() => {
  return diffResult.value?.left ?? []
})

const rightDiffLines = computed<DiffLine[]>(() => {
  return diffResult.value?.right ?? []
})

function triggerCompare() {
  const trimmedOriginal = originalText.value.replace(/\n+$/, '')
  const trimmedCompare = compareText.value.replace(/\n+$/, '')

  if (trimmedOriginal.length > 50000 || trimmedCompare.length > 50000) {
    message.error('文本过长，请控制在 50000 字符以内')
    return
  }

  isComputing.value = true
  try {
    diffResult.value = computeLineDiff(trimmedOriginal, trimmedCompare)
    isHighlighted.value = true
  } catch (e: any) {
    message.error(e.message)
    diffResult.value = null
    isHighlighted.value = false
  } finally {
    isComputing.value = false
  }
  message.success('比较完成')
}

function clearHighlight() {
  diffResult.value = null
  isHighlighted.value = false
  message.success('已清除高亮')
}

function clearAll() {
  originalText.value = ''
  compareText.value = ''
  diffResult.value = null
  isHighlighted.value = false
  message.success('已清空全部内容')
}

async function copyDiff() {
  if (!diffResult.value || (diffResult.value.stats.deletions === 0 && diffResult.value.stats.additions === 0)) {
    message.warning('没有可复制的差异')
    return
  }

  const report = generateLineDiffReport(diffResult.value)
  try {
    await navigator.clipboard.writeText(report)
    message.success('差异已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    triggerCompare()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    clearHighlight()
  }
}
</script>

<template>
  <ToolLayout title="文本比较" @keydown="onKeyDown">
    <!-- Toolbar -->
    <template #toolbar>
      <n-button
        type="primary"
        size="small"
        :loading="isComputing"
        @click="triggerCompare"
      >
        <template #icon>
          <span>🔍</span>
        </template>
        比较
      </n-button>
      <n-divider vertical />
      <n-button size="small" @click="copyDiff" :disabled="!isHighlighted || diffStats.deletions === 0 && diffStats.additions === 0">
        <template #icon>
          <span>📋</span>
        </template>
        复制
      </n-button>
      <n-divider vertical />
      <n-button size="small" @click="clearHighlight" :disabled="!isHighlighted">
        <template #icon>
          <span>✕</span>
        </template>
        清除
      </n-button>
      <n-divider vertical />
      <n-button size="small" @click="clearAll">
        <template #icon>
          <span>🗑️</span>
        </template>
        清空全部
      </n-button>
    </template>

    <!-- Input -->
    <template #input-header>
      <div class="flex items-center justify-between w-full">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">原文</span>
        <div class="flex items-center gap-2">
          <n-tag v-if="originalLengthStatus === 'warning'" type="warning" size="small">较长</n-tag>
          <n-tag v-if="originalLengthStatus === 'error'" type="error" size="small">超限</n-tag>
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ originalText.length }} 字符</span>
        </div>
      </div>
    </template>

    <template #input>
      <InlineDiffEditor
        v-model="originalText"
        :diff-lines="leftDiffLines"
        side="left"
        placeholder="输入原始文本..."
      />
    </template>

    <!-- Output -->
    <template #output-header>
      <div class="flex items-center justify-between w-full">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">对比文</span>
        <div class="flex items-center gap-2">
          <n-tag v-if="compareLengthStatus === 'warning'" type="warning" size="small">较长</n-tag>
          <n-tag v-if="compareLengthStatus === 'error'" type="error" size="small">超限</n-tag>
          <span class="text-xs text-gray-500 dark:text-gray-400">{{ compareText.length }} 字符</span>
        </div>
      </div>
    </template>

    <template #output>
      <InlineDiffEditor
        v-model="compareText"
        :diff-lines="rightDiffLines"
        side="right"
        placeholder="输入对比文本..."
      />
    </template>

    <!-- Custom Footer: Stats -->
    <template #status>
      <div class="flex items-center justify-center gap-4 w-full">
        <span class="text-sm text-gray-600 dark:text-gray-400">差异统计：</span>
        <n-tag type="error" size="small" :bordered="false">删除 {{ diffStats.deletions }} 处</n-tag>
        <n-tag type="success" size="small" :bordered="false">新增 {{ diffStats.additions }} 处</n-tag>
        <span class="text-xs text-gray-400 dark:text-gray-500 ml-4">Ctrl+Enter 比较 | Escape 清除高亮</span>
      </div>
    </template>
  </ToolLayout>
</template>
