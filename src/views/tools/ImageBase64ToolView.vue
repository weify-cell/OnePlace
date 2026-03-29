<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessage } from 'naive-ui'
import AppLayout from '@/components/common/AppLayout.vue'
import ImageDropZone from '@/components/toolbox/ImageDropZone.vue'

type Mode = 'image-to-base64' | 'base64-to-image'
type OutputFormat = 'data-uri' | 'raw'

const router = useRouter()
const message = useMessage()

const mode = ref<Mode>('image-to-base64')
const outputFormat = ref<OutputFormat>('data-uri')
const base64Input = ref('')
const base64Output = ref('')
const imagePreview = ref('')
const isDragging = ref(false)
const fileInfo = ref<{
  name: string
  size: string
  type: string
  width?: number
  height?: number
} | null>(null)

let objectUrl: string | null = null

const modeOptions = [
  { label: '图片 → Base64', value: 'image-to-base64' },
  { label: 'Base64 → 图片', value: 'base64-to-image' }
]

const formatOptions = [
  { label: 'Data URI', value: 'data-uri' },
  { label: '纯 Base64', value: 'raw' }
]

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function processImage(file: File) {
  try {
    const dataUrl = await fileToBase64(file)

    // 获取图片尺寸
    const img = new Image()
    img.onload = () => {
      fileInfo.value = {
        name: file.name,
        size: formatFileSize(file.size),
        type: file.type.split('/')[1].toUpperCase(),
        width: img.width,
        height: img.height
      }
      URL.revokeObjectURL(img.src)
    }
    img.src = dataUrl

    // 设置输出
    if (outputFormat.value === 'raw') {
      base64Output.value = dataUrl.split(',')[1]
    } else {
      base64Output.value = dataUrl
    }

    imagePreview.value = dataUrl
    message.success('转换成功')
  } catch (e) {
    message.error('图片处理失败')
  }
}

async function handleFileSelect(file: File) {
  if (!file.type.startsWith('image/')) {
    message.warning('请选择图片文件')
    return
  }
  await processImage(file)
}

async function handleDrop(files: FileList) {
  const file = files[0]
  if (file && file.type.startsWith('image/')) {
    await processImage(file)
  } else {
    message.warning('请拖拽图片文件')
  }
}

async function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        e.preventDefault()
        await processImage(file)
        return
      }
    }
  }
}

function convertBase64ToImage() {
  if (!base64Input.value.trim()) {
    message.warning('请输入 Base64 内容')
    return
  }

  try {
    let dataUrl = base64Input.value.trim()

    // 如果没有 data-uri 前缀，添加默认前缀
    if (!dataUrl.startsWith('data:')) {
      dataUrl = 'data:image/png;base64,' + dataUrl
    }

    // 验证 Base64
    const img = new Image()
    img.onload = () => {
      fileInfo.value = {
        name: 'decoded-image.png',
        size: formatFileSize(Math.ceil(dataUrl.length * 0.75)),
        type: 'PNG',
        width: img.width,
        height: img.height
      }
      imagePreview.value = dataUrl
      message.success('解码成功')
    }
    img.onerror = () => {
      message.error('无效的 Base64 图片数据')
    }
    img.src = dataUrl
  } catch (e) {
    message.error('解码失败')
  }
}

async function copyResult() {
  if (!base64Output.value) {
    message.warning('没有可复制的内容')
    return
  }
  try {
    await navigator.clipboard.writeText(base64Output.value)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

function downloadImage() {
  if (!imagePreview.value) {
    message.warning('没有可下载的图片')
    return
  }

  const link = document.createElement('a')
  link.href = imagePreview.value
  link.download = fileInfo.value?.name || 'image.png'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function clearAll() {
  base64Input.value = ''
  base64Output.value = ''
  imagePreview.value = ''
  fileInfo.value = null
}

function goBack() {
  router.push('/toolbox')
}

onMounted(() => {
  document.addEventListener('paste', handlePaste)
})

onUnmounted(() => {
  document.removeEventListener('paste', handlePaste)
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
  }
})
</script>

<template>
  <AppLayout>
    <div class="h-full flex flex-col" @paste="handlePaste">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-4 bg-white dark:bg-gray-800">
        <n-button quaternary circle @click="goBack">
          <template #icon>
            <span>←</span>
          </template>
        </n-button>
        <div>
          <h1 class="text-xl font-bold text-gray-900 dark:text-white">图片 Base64 互转</h1>
        </div>
      </div>

      <!-- Mode Switch -->
      <div class="px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <n-radio-group v-model:value="mode" size="medium">
          <n-radio-button
            v-for="option in modeOptions"
            :key="option.value"
            :value="option.value"
            :label="option.label"
          />
        </n-radio-group>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-auto p-6 bg-gray-50 dark:bg-gray-900">
        <!-- Image to Base64 Mode -->
        <div class="max-w-4xl mx-auto space-y-6 mode-container" :class="{ 'mode-active': mode === 'image-to-base64' }">
          <!-- Drop Zone -->
          <ImageDropZone
            :is-dragging="isDragging"
            @drop="handleDrop"
            @file-select="handleFileSelect"
          />

          <!-- Preview -->
          <div class="preview-section" :class="{ 'has-content': imagePreview }">
            <h3 class="text-sm font-medium mb-2 text-gray-900 dark:text-white">图片预览</h3>
            <div class="preview-container">
              <img v-if="imagePreview" :src="imagePreview" alt="Preview" class="preview-image" />
            </div>
          </div>

          <!-- Output Format -->
          <div class="format-section" :class="{ 'has-content': base64Output }">
            <span class="text-sm font-medium mr-4 text-gray-900 dark:text-white">输出格式:</span>
            <n-radio-group v-model:value="outputFormat" size="small">
              <n-radio
                v-for="option in formatOptions"
                :key="option.value"
                :value="option.value"
                :label="option.label"
              />
            </n-radio-group>
          </div>

          <!-- Output -->
          <div class="output-section" :class="{ 'has-content': base64Output }">
            <div class="flex justify-between items-center mb-2">
              <h3 class="text-sm font-medium text-gray-900 dark:text-white">转换结果</h3>
              <n-button size="small" @click="copyResult">
                <template #icon>
                  <span>📋</span>
                </template>
                复制
              </n-button>
            </div>
            <n-input
              v-model:value="base64Output"
              type="textarea"
              :rows="6"
              readonly
              class="font-mono text-xs"
            />
          </div>

          <!-- File Info -->
          <div class="info-section" :class="{ 'has-content': fileInfo }">
            <h3 class="text-sm font-medium mb-2 text-gray-900 dark:text-white">文件信息</h3>
            <n-descriptions :column="2" size="small" bordered>
              <n-descriptions-item label="文件名">{{ fileInfo?.name }}</n-descriptions-item>
              <n-descriptions-item label="格式">{{ fileInfo?.type }}</n-descriptions-item>
              <n-descriptions-item label="大小">{{ fileInfo?.size }}</n-descriptions-item>
              <n-descriptions-item label="尺寸">{{ fileInfo?.width }} × {{ fileInfo?.height }}</n-descriptions-item>
            </n-descriptions>
          </div>
        </div>

        <!-- Base64 to Image Mode -->
        <div class="max-w-4xl mx-auto space-y-6 mode-container" :class="{ 'mode-active': mode === 'base64-to-image' }">
          <!-- Input -->
          <div class="input-section">
            <div class="flex justify-between items-center mb-2">
              <h3 class="text-sm font-medium text-gray-900 dark:text-white">Base64 输入</h3>
              <n-button size="small" @click="clearAll">
                <template #icon>
                  <span>🗑️</span>
                </template>
                清空
              </n-button>
            </div>
            <n-input
              v-model:value="base64Input"
              type="textarea"
              :rows="6"
              placeholder="粘贴 Base64 编码或 Data URI..."
              class="font-mono text-xs"
            />
            <n-button
              type="primary"
              class="mt-3"
              @click="convertBase64ToImage"
              :disabled="!base64Input.trim()"
            >
              <template #icon>
                <span>🔄</span>
              </template>
              转换
            </n-button>
          </div>

          <!-- Preview -->
          <div class="preview-section" :class="{ 'has-content': imagePreview }">
            <div class="flex justify-between items-center mb-2">
              <h3 class="text-sm font-medium text-gray-900 dark:text-white">图片预览</h3>
              <n-button type="info" size="small" @click="downloadImage">
                <template #icon>
                  <span>💾</span>
                </template>
                下载图片
              </n-button>
            </div>
            <div class="preview-container">
              <img v-if="imagePreview" :src="imagePreview" alt="Preview" class="preview-image" />
            </div>
          </div>

          <!-- File Info -->
          <div class="info-section" :class="{ 'has-content': fileInfo }">
            <h3 class="text-sm font-medium mb-2 text-gray-900 dark:text-white">图片信息</h3>
            <n-descriptions :column="2" size="small" bordered>
              <n-descriptions-item label="格式">{{ fileInfo?.type }}</n-descriptions-item>
              <n-descriptions-item label="大小">{{ fileInfo?.size }}</n-descriptions-item>
              <n-descriptions-item label="尺寸">{{ fileInfo?.width }} × {{ fileInfo?.height }}</n-descriptions-item>
            </n-descriptions>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.mode-container {
  position: absolute;
  width: 100%;
  max-width: 56rem;
  opacity: 0;
  max-height: 0;
  overflow: hidden;
  transition: opacity 0.3s ease, max-height 0.3s ease;
  pointer-events: none;
}

.mode-container.mode-active {
  position: relative;
  opacity: 1;
  max-height: 9999px;
  pointer-events: auto;
}

.preview-section,
.input-section,
.output-section,
.info-section,
.format-section {
  background: var(--n-color);
  border-radius: 8px;
  padding: 16px;
  opacity: 0;
  max-height: 0;
  overflow: hidden;
  transition: opacity 0.3s ease, max-height 0.3s ease, padding 0.3s ease;
}

.preview-section.has-content,
.input-section.has-content,
.output-section.has-content,
.info-section.has-content,
.format-section.has-content {
  opacity: 1;
  max-height: 9999px;
}

.preview-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  max-height: 400px;
  background: var(--n-color-modal);
  border-radius: 8px;
  overflow: hidden;
}

.preview-image {
  max-width: 100%;
  max-height: 380px;
  object-fit: contain;
}
</style>
