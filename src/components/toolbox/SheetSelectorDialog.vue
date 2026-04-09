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

const selectedIndexes = ref<number[]>([])

watch(() => props.show, (newVal) => {
  if (newVal) {
    if (props.initialSelection.length > 0) {
      selectedIndexes.value = [...props.initialSelection]
    } else {
      selectedIndexes.value = props.sheets
        .filter(s => !s.isEmpty)
        .map(s => s.index)
    }
  }
}, { immediate: true })

const isAllSelected = computed(() => {
  return props.sheets.length > 0 && selectedIndexes.value.length === props.sheets.length
})

const isIndeterminate = computed(() => {
  return selectedIndexes.value.length > 0 && selectedIndexes.value.length < props.sheets.length
})

function toggleAll() {
  if (isAllSelected.value) {
    selectedIndexes.value = []
  } else {
    selectedIndexes.value = props.sheets.map(s => s.index)
  }
}

function toggleSheet(index: number) {
  const idx = selectedIndexes.value.indexOf(index)
  if (idx === -1) {
    selectedIndexes.value.push(index)
  } else {
    selectedIndexes.value.splice(idx, 1)
  }
}

function confirm() {
  if (selectedIndexes.value.length === 0) return
  emit('confirm', [...selectedIndexes.value])
}

function cancel() {
  emit('cancel')
  emit('update:show', false)
}

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
      <span class="dialog-extra">已选择: {{ selectedIndexes.length }} 个</span>
    </template>

    <div class="dialog-body">
      <!-- 全选 -->
      <div class="dialog-select-all">
        <n-checkbox
          :checked="isAllSelected"
          :indeterminate="isIndeterminate"
          @update:checked="toggleAll"
        >
          全选
        </n-checkbox>
      </div>

      <!-- Sheet 列表 -->
      <div class="dialog-sheets">
        <div
          v-for="sheet in sheets"
          :key="sheet.index"
          :class="[
            'dialog-sheet',
            selectedIndexes.includes(sheet.index) && 'dialog-sheet--selected',
            sheet.isEmpty && 'dialog-sheet--empty'
          ]"
          @click="toggleSheet(sheet.index)"
        >
          <n-checkbox
            :checked="selectedIndexes.includes(sheet.index)"
            @update:checked="toggleSheet(sheet.index)"
          />
          <div class="dialog-sheet__info">
            <div class="dialog-sheet__name">{{ sheet.name }}</div>
            <div class="dialog-sheet__meta">
              {{ sheet.rowCount }} 行数据
              <n-tag v-if="sheet.isEmpty" type="warning" size="small" class="ml-2">空 Sheet</n-tag>
            </div>
          </div>
        </div>
      </div>

      <!-- 输出格式预览 -->
      <div class="dialog-preview">
        <div class="dialog-preview__label">
          输出格式: <span class="dialog-preview__value">{{ outputFormat }}</span>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<style scoped>
.dialog-extra {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.dialog-body {
  padding: 4px 0;
}

.dialog-select-all {
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.dialog-sheets {
  max-height: 256px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dialog-sheet {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s ease;
}

.dialog-sheet:hover {
  background: var(--bg-secondary);
}

.dialog-sheet--selected {
  background: rgba(245, 158, 11, 0.06);
  border-color: rgba(245, 158, 11, 0.25);
}

.dialog-sheet--empty {
  border-color: rgba(251, 191, 36, 0.3);
}

.dialog-sheet__info {
  flex: 1;
  min-width: 0;
}

.dialog-sheet__name {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.dialog-sheet__meta {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.dialog-preview {
  margin-top: 16px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
}

.dialog-preview__label {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.dialog-preview__value {
  font-weight: 600;
  color: var(--text-primary);
}
</style>
