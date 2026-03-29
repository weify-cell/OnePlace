<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { SheetInfo } from '@/utils/excel'

interface Props {
  show: boolean
  sheets: SheetInfo[]
  initialSelection?: number[]
}

const props = withDefaults(defineProps<Props>(), {
  initialSelection: () => []
})

const emit = defineEmits<{
  'update:show': [value: boolean]
  'confirm': [selectedIndexes: number[]]
  'cancel': []
}>()

// 选中状态
const selectedIndexes = ref<number[]>([])

// 初始化选中状态
watch(() => props.show, (newVal) => {
  if (newVal) {
    if (props.initialSelection.length > 0) {
      selectedIndexes.value = [...props.initialSelection]
    } else {
      // 默认选中所有非空 Sheet
      selectedIndexes.value = props.sheets
        .filter(s => !s.isEmpty)
        .map(s => s.index)
    }
  }
}, { immediate: true })

// 全选状态
const isAllSelected = computed(() => {
  return props.sheets.length > 0 && selectedIndexes.value.length === props.sheets.length
})

const isIndeterminate = computed(() => {
  return selectedIndexes.value.length > 0 && selectedIndexes.value.length < props.sheets.length
})

// 全选/取消全选
function toggleAll() {
  if (isAllSelected.value) {
    selectedIndexes.value = []
  } else {
    selectedIndexes.value = props.sheets.map(s => s.index)
  }
}

// 切换单个 Sheet
function toggleSheet(index: number) {
  const idx = selectedIndexes.value.indexOf(index)
  if (idx === -1) {
    selectedIndexes.value.push(index)
  } else {
    selectedIndexes.value.splice(idx, 1)
  }
}

// 确认选择
function confirm() {
  if (selectedIndexes.value.length === 0) return
  emit('confirm', [...selectedIndexes.value])
}

// 取消
function cancel() {
  emit('cancel')
  emit('update:show', false)
}

// 输出格式预览
const outputFormat = computed(() => {
  if (selectedIndexes.value.length === 0) return '未选择'
  if (selectedIndexes.value.length === 1) return '数组格式 [...]'
  return '对象格式 { ... }'
})
</script>

<template>
  <n-modal
    :show="show"
    preset="dialog"
    title="选择要导入的工作表"
    style="width: 480px"
    :positive-text="selectedIndexes.length > 0 ? '确认导入' : undefined"
    :negative-text="'取消'"
    @positive-click="confirm"
    @negative-click="cancel"
    @close="cancel"
    :closable="true"
  >
    <template #header-extra>
      <span class="text-xs text-gray-500">已选择: {{ selectedIndexes.length }} 个</span>
    </template>

    <div class="py-4">
      <!-- 全选 -->
      <div class="flex items-center gap-3 pb-3 mb-3 border-b border-gray-200 dark:border-gray-700">
        <n-checkbox
          :checked="isAllSelected"
          :indeterminate="isIndeterminate"
          @update:checked="toggleAll"
        >
          全选
        </n-checkbox>
      </div>

      <!-- Sheet 列表 -->
      <div class="max-h-64 overflow-y-auto space-y-2">
        <div
          v-for="sheet in sheets"
          :key="sheet.index"
          class="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
          :class="{
            'bg-blue-50 dark:bg-blue-900/20': selectedIndexes.includes(sheet.index),
            'border border-yellow-300 dark:border-yellow-600': sheet.isEmpty
          }"
          @click="toggleSheet(sheet.index)"
        >
          <n-checkbox
            :checked="selectedIndexes.includes(sheet.index)"
            @update:checked="toggleSheet(sheet.index)"
          />
          <div class="flex-1">
            <div class="font-medium text-gray-900 dark:text-white">{{ sheet.name }}</div>
            <div class="text-xs text-gray-500">
              {{ sheet.rowCount }} 行数据
              <n-tag v-if="sheet.isEmpty" type="warning" size="small" class="ml-2">空 Sheet</n-tag>
            </div>
          </div>
        </div>
      </div>

      <!-- 输出格式预览 -->
      <div class="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div class="text-sm text-gray-600 dark:text-gray-400">
          输出格式: <span class="font-medium text-gray-900 dark:text-white">{{ outputFormat }}</span>
        </div>
      </div>
    </div>
  </n-modal>
</template>
