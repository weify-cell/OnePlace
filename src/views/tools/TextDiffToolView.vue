<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage, useDialog } from 'naive-ui'
import AppLayout from '@/components/common/AppLayout.vue'
import DiffResultPanel from '@/components/toolbox/DiffResultPanel.vue'
import {
  computeDiff,
  generateReport,
  getDiffPositions,
  getTextLengthStatus,
  type DiffPosition
} from '@/utils/text-diff'
import type { Change } from 'diff'

const router = useRouter()
const message = useMessage()

const originalText = ref('')
const compareText = ref('')
const diffResult = ref<Change[]>([])
const diffStats = ref({ totalDiffs: 0, sameChars: 0, diffChars: 0 })
const diffPositions = ref<DiffPosition[]>([])
const currentDiffIndex = ref(-1)
const isComputing = ref(false)

// 文本长度状态
const originalLengthStatus = computed(() => getTextLengthStatus(originalText.value.length))
const compareLengthStatus = computed(() => getTextLengthStatus(compareText.value.length))
const needsManualTrigger = computed(() => {
  return originalLengthStatus.value === 'warning' || compareLengthStatus.value === 'warning'
})

// 计算差异
function doComputeDiff() {
  if (!originalText.value && !compareText.value) {
    diffResult.value = []
    diffStats.value = { totalDiffs: 0, sameChars: 0, diffChars: 0 }
    diffPositions.value = []
    currentDiffIndex.value = -1
    return
  }

  isComputing.value = true
  try {
    const result = computeDiff(originalText.value, compareText.value)
    diffResult.value = result.changes
    diffStats.value = result.stats
    diffPositions.value = getDiffPositions(result.changes, originalText.value, compareText.value)
    currentDiffIndex.value = diffPositions.value.length > 0 ? 0 : -1
  } catch (e: any) {
    message.error(e.message)
    diffResult.value = []
    diffStats.value = { totalDiffs: 0, sameChars: 0, diffChars: 0 }
    diffPositions.value = []
  } finally {
    isComputing.value = false
  }
}

// 实时计算（防抖）
let debounceTimer: ReturnType<typeof setTimeout> | null = null
function scheduleCompute() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (!needsManualTrigger.value) {
      doComputeDiff()
    }
  }, 300)
}

// 监听文本变化
watch([originalText, compareText], () => {
  if (!needsManualTrigger.value) {
    scheduleCompute()
  } else {
    // 大文本模式下清除结果，提示用户手动触发
    diffResult.value = []
    diffStats.value = { totalDiffs: 0, sameChars: 0, diffChars: 0 }
    diffPositions.value = []
    currentDiffIndex.value = -1
  }
})

// 手动触发比较
function triggerCompare() {
  if (originalLengthStatus.value === 'error' || compareLengthStatus.value === 'error') {
    message.error('文本过长，请控制在 50000 字符以内')
    return
  }
  doComputeDiff()
  message.success('比较完成')
}

// 导航到上一处差异
function navigatePrev() {
  if (diffPositions.value.length === 0) return
  if (currentDiffIndex.value <= 0) {
    currentDiffIndex.value = diffPositions.value.length - 1
  } else {
    currentDiffIndex.value--
  }
}

// 导航到下一处差异
function navigateNext() {
  if (diffPositions.value.length === 0) return
  if (currentDiffIndex.value >= diffPositions.value.length - 1) {
    currentDiffIndex.value = 0
  } else {
    currentDiffIndex.value++
  }
}

// 处理导航
function onNavigate(index: number) {
  currentDiffIndex.value = index
}

// 复制差异报告
async function copyReport() {
  if (diffPositions.value.length === 0) {
    message.warning('没有可复制的差异报告')
    return
  }

  const report = generateReport(
    { changes: diffResult.value, stats: diffStats.value },
    originalText.value,
    compareText.value,
    diffPositions.value
  )

  try {
    await navigator.clipboard.writeText(report)
    message.success('差异报告已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

// 清空原文
function clearOriginal() {
  originalText.value = ''
  doComputeDiff()
}

// 清空对比文
function clearCompare() {
  compareText.value = ''
  doComputeDiff()
}

// 清空全部
function clearAll() {
  originalText.value = ''
  compareText.value = ''
  diffResult.value = []
  diffStats.value = { totalDiffs: 0, sameChars: 0, diffChars: 0 }
  diffPositions.value = []
  currentDiffIndex.value = -1
  message.success('已清空全部内容')
}

// 返回
function goBack() {
  router.push('/toolbox')
}
</script>

<template>
  <AppLayout>
    <div class="h-full flex flex-col">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-4 bg-white dark:bg-gray-800">
        <n-button quaternary circle @click="goBack">
          <template #icon>
            <span>←</span>
          </template>
        </n-button>
        <div>
          <h1 class="text-xl font-bold text-gray-900 dark:text-white">文本比较工具</h1>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-2 bg-white dark:bg-gray-800">
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
        <n-button size="small" @click="navigatePrev" :disabled="diffPositions.length === 0">
          <template #icon>
            <span>⬆️</span>
          </template>
          上一处
        </n-button>
        <n-button size="small" @click="navigateNext" :disabled="diffPositions.length === 0">
          <template #icon>
            <span>⬇️</span>
          </template>
          下一处
        </n-button>
        <n-divider vertical />
        <n-button size="small" @click="copyReport" :disabled="diffPositions.length === 0">
          <template #icon>
            <span>📋</span>
          </template>
          复制报告
        </n-button>
        <n-divider vertical />
        <n-button size="small" @click="clearAll">
          <template #icon>
            <span>🗑️</span>
          </template>
          清空全部
        </n-button>
      </div>

      <!-- Warning Banner -->
      <div v-if="needsManualTrigger" class="px-6 py-2 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
        <n-alert type="warning" :show-icon="true">
          文本较长，已切换为手动比较模式，请点击「比较」按钮触发计算
        </n-alert>
      </div>

      <div v-if="originalLengthStatus === 'error' || compareLengthStatus === 'error'" class="px-6 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
        <n-alert type="error" :show-icon="true">
          文本超过 50000 字符限制，请缩短文本长度
        </n-alert>
      </div>

      <!-- Input Panels -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Original Text -->
        <div class="flex-1 flex flex-col border-r border-gray-200 dark:border-gray-700">
          <div class="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">原文</span>
            <div class="flex items-center gap-2">
              <n-tag v-if="originalLengthStatus === 'warning'" type="warning" size="small">较长</n-tag>
              <n-tag v-if="originalLengthStatus === 'error'" type="error" size="small">超限</n-tag>
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ originalText.length }} 字符</span>
            </div>
          </div>
          <div class="flex-1">
            <textarea
              v-model="originalText"
              class="diff-textarea"
              placeholder="输入原始文本..."
            />
          </div>
          <div class="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex justify-end">
            <n-button size="tiny" @click="clearOriginal" :disabled="!originalText">
              清空
            </n-button>
          </div>
        </div>

        <!-- Compare Text -->
        <div class="flex-1 flex flex-col">
          <div class="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">对比文</span>
            <div class="flex items-center gap-2">
              <n-tag v-if="compareLengthStatus === 'warning'" type="warning" size="small">较长</n-tag>
              <n-tag v-if="compareLengthStatus === 'error'" type="error" size="small">超限</n-tag>
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ compareText.length }} 字符</span>
            </div>
          </div>
          <div class="flex-1">
            <textarea
              v-model="compareText"
              class="diff-textarea"
              placeholder="输入对比文本..."
            />
          </div>
          <div class="px-4 py-2 border-t border-gray-200 dark:-border-gray-700 flex justify-end">
            <n-button size="tiny" @click="clearCompare" :disabled="!compareText">
              清空
            </n-button>
          </div>
        </div>
      </div>

      <!-- Result Panel -->
      <div class="h-64 flex flex-col border-t border-gray-200 dark:border-gray-700">
        <div class="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">差异结果</span>
          <div class="flex items-center gap-4">
            <span class="text-xs text-gray-500 dark:text-gray-400">
              差异：{{ diffStats.totalDiffs }} 处 | 相同：{{ diffStats.sameChars }} | 差异字符：{{ diffStats.diffChars }}
            </span>
          </div>
        </div>
        <div class="flex-1 overflow-hidden">
          <DiffResultPanel
            v-if="diffResult.length > 0"
            :diffs="diffResult"
            :current-index="currentDiffIndex"
            @navigate="onNavigate"
          />
          <div v-else class="h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
            <span v-if="needsManualTrigger">文本较长，请点击「比较」按钮查看差异</span>
            <span v-else-if="!originalText && !compareText">请在两侧输入文本进行比较</span>
            <span v-else-if="originalText || compareText">无差异</span>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.diff-textarea {
  width: 100%;
  height: 100%;
  padding: 12px;
  border: none;
  resize: none;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 14px;
  line-height: 1.6;
  background: var(--n-color);
  color: var(--n-text-color);
}

.diff-textarea:focus {
  outline: none;
}

.diff-textarea::placeholder {
  color: var(--n-text-color-3);
}
</style>
