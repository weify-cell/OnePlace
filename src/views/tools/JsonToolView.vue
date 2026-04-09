<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import ToolLayout from '@/components/toolbox/ToolLayout.vue'
import JsonEditor from '@/components/toolbox/JsonEditor.vue'
import SheetSelectorDialog from '@/components/toolbox/SheetSelectorDialog.vue'
import {
  previewExcelSheets,
  parseExcelFile,
  exportToExcel,
  isExcelFile,
  canExportToExcel,
  type SheetInfo
} from '@/utils/excel'

const message = useMessage()

const inputValue = ref('')
const outputValue = ref('')
const validationError = ref('')
const isDark = ref(typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : false)
const fileInputRef = ref<HTMLInputElement>()

// Sheet 选择器状态
const showSheetSelector = ref(false)
const sheetList = ref<SheetInfo[]>([])
const pendingFile = ref<File | null>(null)

const inputEditorRef = ref<InstanceType<typeof JsonEditor>>()
const outputEditorRef = ref<InstanceType<typeof JsonEditor>>()

const charCount = computed(() => inputValue.value.length)
const lineCount = computed(() => inputValue.value.split('\n').length)
const canExport = computed(() => {
  try {
    if (!inputValue.value.trim()) return false
    const parsed = JSON.parse(inputValue.value)
    return canExportToExcel(parsed)
  } catch {
    return false
  }
})

const statusText = computed(() => {
  if (validationError.value) return validationError.value
  return '支持拖拽 JSON 或 Excel 文件到输入区域'
})

function formatJson() {
  try {
    if (!inputValue.value.trim()) {
      message.warning('请输入 JSON 内容')
      return
    }
    const parsed = JSON.parse(inputValue.value)
    outputValue.value = JSON.stringify(parsed, null, 2)
    validationError.value = ''
  } catch (e: any) {
    validationError.value = e.message
    message.error('JSON 格式错误: ' + e.message)
  }
}

function compressJson() {
  try {
    if (!inputValue.value.trim()) {
      message.warning('请输入 JSON 内容')
      return
    }
    const parsed = JSON.parse(inputValue.value)
    outputValue.value = JSON.stringify(parsed)
    validationError.value = ''
  } catch (e: any) {
    validationError.value = e.message
    message.error('JSON 格式错误: ' + e.message)
  }
}

function validateJson() {
  try {
    if (!inputValue.value.trim()) {
      message.warning('请输入 JSON 内容')
      return
    }
    JSON.parse(inputValue.value)
    validationError.value = ''
    message.success('JSON 格式有效')
  } catch (e: any) {
    validationError.value = e.message
    message.error('JSON 格式错误: ' + e.message)
  }
}

function escapeJson() {
  try {
    if (!inputValue.value.trim()) {
      message.warning('请输入 JSON 内容')
      return
    }
    outputValue.value = JSON.stringify(inputValue.value).slice(1, -1)
  } catch (e: any) {
    message.error('转义失败: ' + e.message)
  }
}

function unescapeJson() {
  try {
    if (!inputValue.value.trim()) {
      message.warning('请输入 JSON 内容')
      return
    }
    const wrapped = '"' + inputValue.value + '"'
    outputValue.value = JSON.parse(wrapped)
  } catch (e: any) {
    message.error('去转义失败: ' + e.message)
  }
}

async function copyResult() {
  if (!outputValue.value) {
    message.warning('没有可复制的内容')
    return
  }
  try {
    await navigator.clipboard.writeText(outputValue.value)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

async function pasteInput() {
  try {
    const text = await navigator.clipboard.readText()
    inputValue.value = text
    message.success('已粘贴')
  } catch {
    message.error('无法读取剪贴板')
  }
}

function clearInput() {
  inputValue.value = ''
  outputValue.value = ''
  validationError.value = ''
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()
  const file = e.dataTransfer?.files[0]
  if (!file) return

  if (file.type === 'application/json') {
    const text = await file.text()
    inputValue.value = text
    message.success(`已加载文件: ${file.name}`)
  } else if (isExcelFile(file)) {
    await handleExcelFile(file)
  } else {
    message.warning('请上传 JSON 或 Excel 文件')
  }
}

function importExcel() {
  fileInputRef.value?.click()
}

async function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  if (!isExcelFile(file)) {
    message.warning('请选择 .xlsx 或 .xls 格式的文件')
    target.value = ''
    return
  }

  await handleExcelFile(file)
  target.value = ''
}

async function handleExcelFile(file: File) {
  try {
    const sheets = await previewExcelSheets(file)

    if (sheets.length === 1) {
      const result = await parseExcelFile(file, { selectedSheetIndexes: [0] })
      inputValue.value = JSON.stringify(result.data, null, 2)
      message.success(`已导入 Excel: ${file.name}`)
    } else {
      sheetList.value = sheets
      pendingFile.value = file
      showSheetSelector.value = true
    }
  } catch (error: any) {
    message.error(error.message)
  }
}

async function onSheetSelectConfirmed(selectedIndexes: number[]) {
  if (!pendingFile.value) return

  try {
    const result = await parseExcelFile(pendingFile.value, {
      selectedSheetIndexes: selectedIndexes
    })
    inputValue.value = JSON.stringify(result.data, null, 2)
    message.success(`已导入 Excel: ${pendingFile.value.name}`)
    showSheetSelector.value = false
    pendingFile.value = null
  } catch (error: any) {
    message.error(error.message)
  }
}

function onSheetSelectCancel() {
  showSheetSelector.value = false
  pendingFile.value = null
}

function exportExcel() {
  try {
    if (!inputValue.value.trim()) {
      message.warning('没有可导出的数据')
      return
    }

    const parsed = JSON.parse(inputValue.value)
    if (!canExportToExcel(parsed)) {
      message.warning('JSON 格式无效，无法导出')
      return
    }

    exportToExcel(parsed)
    message.success('Excel 导出成功')
  } catch (e: any) {
    message.error(e.message || '导出失败')
  }
}
</script>

<template>
  <ToolLayout title="JSON 格式化" :status="statusText">
    <!-- Toolbar -->
    <template #toolbar>
      <n-button type="primary" size="small" @click="formatJson">
        <template #icon><span>✨</span></template>
        格式化
      </n-button>
      <n-button size="small" @click="compressJson">
        <template #icon><span>🗜️</span></template>
        压缩
      </n-button>
      <n-button size="small" @click="validateJson">
        <template #icon><span>✓</span></template>
        验证
      </n-button>
      <n-button size="small" @click="escapeJson">
        <template #icon><span>\</span></template>
        转义
      </n-button>
      <n-button size="small" @click="unescapeJson">
        <template #icon><span>/</span></template>
        去转义
      </n-button>
      <n-divider vertical />
      <n-button size="small" @click="importExcel">
        <template #icon><span>📥</span></template>
        导入 Excel
      </n-button>
      <n-button size="small" @click="exportExcel" :disabled="!canExport">
        <template #icon><span>📤</span></template>
        导出 Excel
      </n-button>
      <n-divider vertical />
      <n-button size="small" @click="pasteInput">
        <template #icon><span>📋</span></template>
        粘贴
      </n-button>
      <n-button size="small" @click="clearInput">
        <template #icon><span>🗑️</span></template>
        清空
      </n-button>
      <n-button type="info" size="small" @click="copyResult" :disabled="!outputValue">
        <template #icon><span>📄</span></template>
        复制结果
      </n-button>
    </template>

    <!-- Input -->
    <template #input-header>
      <div class="flex items-center justify-between w-full">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">输入</span>
        <span class="text-xs text-gray-500 dark:text-gray-400">{{ charCount }} 字符 | {{ lineCount }} 行</span>
      </div>
    </template>

    <template #input>
      <div class="h-full" @drop.prevent="handleDrop" @dragover.prevent>
        <JsonEditor
          ref="inputEditorRef"
          v-model="inputValue"
          :theme="isDark ? 'vs-dark' : 'vs'"
        />
      </div>
    </template>

    <!-- Output -->
    <template #output-header>
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">输出</span>
    </template>

    <template #output-actions>
      <n-tag v-if="validationError" type="error" size="small">格式错误</n-tag>
      <n-tag v-else-if="outputValue" type="success" size="small">有效</n-tag>
    </template>

    <template #output>
      <JsonEditor
        ref="outputEditorRef"
        v-model="outputValue"
        :theme="isDark ? 'vs-dark' : 'vs'"
        readonly
      />
    </template>

    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".xlsx,.xls"
      class="hidden"
      @change="handleFileChange"
    />

    <!-- Sheet Selector Dialog -->
    <SheetSelectorDialog
      v-model:show="showSheetSelector"
      :sheets="sheetList"
      @confirm="onSheetSelectConfirmed"
      @cancel="onSheetSelectCancel"
    />
  </ToolLayout>
</template>
