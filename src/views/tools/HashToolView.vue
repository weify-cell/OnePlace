<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import ToolLayout from '@/components/toolbox/ToolLayout.vue'
import md5 from 'md5'
import sha1 from 'js-sha1'
import sha256 from 'js-sha256'
import { sha512 } from 'js-sha512'
import { sha3_256, sha3_512 } from 'js-sha3'
import sm3 from 'sm3'

const message = useMessage()

type Algorithm = 'md5' | 'sha1' | 'sha256' | 'sha512' | 'sha3-256' | 'sha3-512' | 'sm3'
type TabMode = 'md5-sha1' | 'sha2' | 'sha3-sm3' | 'encoding'
type InputMode = 'text' | 'file'
type TransformMode = 'encode' | 'decode'

const tabMode = ref<TabMode>('md5-sha1')
const inputMode = ref<InputMode>('text')
const textInput = ref('')
const hashResult = ref('')
const verifyInput = ref('')
const verifyResult = ref<'match' | 'mismatch' | null>(null)

// File upload state
const selectedFile = ref<File | null>(null)
const fileProgress = ref(0)
const isComputing = ref(false)

// Encoding state
const transformMode = ref<TransformMode>('encode')
const encodeInput = ref('')
const encodeResult = ref('')
const decodeInput = ref('')
const decodeResult = ref('')
const encodingError = ref('')

const selectedAlgorithm = ref<Algorithm>('md5')

const tabAlgorithms: Record<TabMode, Algorithm[]> = {
  'md5-sha1': ['md5', 'sha1'],
  'sha2': ['sha256', 'sha512'],
  'sha3-sm3': ['sha3-256', 'sha3-512', 'sm3']
}

const algorithmNames: Record<Algorithm, string> = {
  'md5': 'MD5',
  'sha1': 'SHA1',
  'sha256': 'SHA256',
  'sha512': 'SHA512',
  'sha3-256': 'SHA3-256',
  'sha3-512': 'SHA3-512',
  'sm3': 'SM3'
}

const currentTabAlgorithms = computed(() => tabAlgorithms[tabMode.value])

function selectTab(tab: TabMode) {
  tabMode.value = tab
  selectedAlgorithm.value = tabAlgorithms[tab][0]
  hashResult.value = ''
  verifyResult.value = null
}

function selectAlgorithm(algo: Algorithm) {
  selectedAlgorithm.value = algo
  hashResult.value = ''
  verifyResult.value = null
}

function computeTextHash(text: string): string {
  switch (selectedAlgorithm.value) {
    case 'md5':
      return md5(text)
    case 'sha1':
      return sha1(text)
    case 'sha256':
      return sha256(text)
    case 'sha512':
      return sha512(text)
    case 'sha3-256':
      return sha3_256(text)
    case 'sha3-512':
      return sha3_512(text)
    case 'sm3':
      return sm3(text)
    default:
      return ''
  }
}

function computeFileHash(file: File, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    reader.onload = (e) => {
      const data = e.target!.result as ArrayBuffer
      const uint8 = new Uint8Array(data)
      let hash: string
      switch (selectedAlgorithm.value) {
        case 'md5':
          hash = md5(Array.from(uint8))
          break
        case 'sha1':
          hash = sha1(Array.from(uint8))
          break
        case 'sha256':
          hash = sha256(Array.from(uint8))
          break
        case 'sha512':
          hash = sha512(Array.from(uint8))
          break
        case 'sha3-256':
          hash = sha3_256(uint8)
          break
        case 'sha3-512':
          hash = sha3_512(uint8)
          break
        case 'sm3':
          hash = sm3(Array.from(uint8))
          break
        default:
          hash = ''
      }
      resolve(hash)
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsArrayBuffer(file)
  })
}

async function calculateHash() {
  if (inputMode.value === 'text') {
    if (!textInput.value) {
      message.warning('请输入文本内容')
      return
    }
    hashResult.value = computeTextHash(textInput.value)
    verifyResult.value = null
  } else {
    if (!selectedFile.value) {
      message.warning('请选择文件')
      return
    }
    isComputing.value = true
    fileProgress.value = 0
    try {
      hashResult.value = await computeFileHash(selectedFile.value, (pct) => {
        fileProgress.value = pct
      })
      verifyResult.value = null
    } catch (e) {
      message.error('文件计算失败')
    } finally {
      isComputing.value = false
    }
  }
}

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files && target.files[0]) {
    selectedFile.value = target.files[0]
    hashResult.value = ''
    verifyResult.value = null
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// Base64 UTF-8 编解码
function btoaUtf8(str: string): string {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))))
}

function atobUtf8(str: string): string {
  return decodeURIComponent(atob(str).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''))
}

// Hex 编解码
function strToHex(str: string): string {
  return Array.from(new TextEncoder().encode(str)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function hexToStr(hex: string): string {
  const match = hex.match(/.{2}/g)
  if (!match) throw new Error('Invalid hex string')
  return new TextDecoder().decode(new Uint8Array(match.map(b => parseInt(b, 16))))
}

async function copyResult() {
  if (!hashResult.value) {
    message.warning('没有可复制的内容')
    return
  }
  try {
    await navigator.clipboard.writeText(hashResult.value)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

function verifyHash() {
  if (!hashResult.value) {
    message.warning('请先生成哈希值')
    return
  }
  if (!verifyInput.value.trim()) {
    message.warning('请输入待校验的哈希值')
    return
  }
  const expected = verifyInput.value.trim().toLowerCase()
  const actual = hashResult.value.toLowerCase()
  verifyResult.value = expected === actual ? 'match' : 'mismatch'
}

function encodeText() {
  encodingError.value = ''
  const input = encodeInput.value
  if (!input) {
    message.warning('请输入文本内容')
    return
  }
  try {
    encodeResult.value = btoaUtf8(input)
  } catch {
    encodingError.value = '编码失败：无效字符'
    message.error('编码失败')
  }
}

function decodeText() {
  encodingError.value = ''
  const input = decodeInput.value.trim()
  if (!input) {
    message.warning('请输入 Base64 内容')
    return
  }
  try {
    decodeResult.value = atobUtf8(input)
  } catch {
    encodingError.value = '解码失败：无效 Base64 格式'
    message.error('解码失败：无效 Base64 格式')
  }
}

async function copyEncodeResult() {
  if (!encodeResult.value) { message.warning('没有可复制的内容'); return }
  try {
    await navigator.clipboard.writeText(encodeResult.value)
    message.success('已复制到剪贴板')
  } catch { message.error('复制失败') }
}

async function copyDecodeResult() {
  if (!decodeResult.value) { message.warning('没有可复制的内容'); return }
  try {
    await navigator.clipboard.writeText(decodeResult.value)
    message.success('已复制到剪贴板')
  } catch { message.error('复制失败') }
}

function clearAll() {
  textInput.value = ''
  hashResult.value = ''
  verifyInput.value = ''
  verifyResult.value = null
  selectedFile.value = null
  fileProgress.value = 0
  encodeInput.value = ''
  encodeResult.value = ''
  decodeInput.value = ''
  decodeResult.value = ''
  encodingError.value = ''
}

const statusText = computed(() => {
  return `当前算法：${algorithmNames[selectedAlgorithm.value]}`
})
</script>

<template>
  <ToolLayout title="哈希计算" :status="statusText">
    <!-- Toolbar -->
    <template #toolbar>
      <!-- Tab buttons -->
      <n-button-group>
        <n-button
          :type="tabMode === 'md5-sha1' ? 'primary' : 'default'"
          size="small"
          @click="selectTab('md5-sha1')"
        >
          MD5/SHA1
        </n-button>
        <n-button
          :type="tabMode === 'sha2' ? 'primary' : 'default'"
          size="small"
          @click="selectTab('sha2')"
        >
          SHA2
        </n-button>
        <n-button
          :type="tabMode === 'sha3-sm3' ? 'primary' : 'default'"
          size="small"
          @click="selectTab('sha3-sm3')"
        >
          SHA-3/SM3
        </n-button>
      </n-button-group>
      <n-button
        :type="tabMode === 'encoding' ? 'primary' : 'default'"
        size="small"
        @click="selectTab('encoding')"
      >
        编码转换
      </n-button>

      <n-divider vertical />

      <!-- Algorithm selector -->
      <n-button-group>
        <n-button
          v-for="algo in currentTabAlgorithms"
          :key="algo"
          :type="selectedAlgorithm === algo ? 'primary' : 'default'"
          size="small"
          @click="selectAlgorithm(algo)"
        >
          {{ algorithmNames[algo] }}
        </n-button>
      </n-button-group>

      <n-divider vertical />

      <!-- Input mode toggle -->
      <n-radio-group v-model:value="inputMode" size="small">
        <n-radio-button value="text">文本输入</n-radio-button>
        <n-radio-button value="file">文件上传</n-radio-button>
      </n-radio-group>

      <n-divider vertical />

      <n-button size="small" @click="clearAll">
        <template #icon>
          <span>🗑️</span>
        </template>
        清空
      </n-button>
    </template>

    <!-- Input -->
    <template #input-header>
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
        {{ inputMode === 'text' ? '文本输入' : '文件上传' }}
      </span>
    </template>

    <template #input>
      <div class="h-full flex flex-col justify-center">
        <!-- Text input mode -->
        <template v-if="inputMode === 'text'">
          <n-input
            v-model:value="textInput"
            type="textarea"
            placeholder="请输入文本内容..."
            :rows="8"
            class="font-mono text-sm"
            @keyup.enter.ctrl="calculateHash"
          />
          <n-button
            type="primary"
            size="large"
            block
            style="margin-top: 16px"
            @click="calculateHash"
          >
            计算哈希
          </n-button>
        </template>

        <!-- File upload mode -->
        <template v-else>
          <div class="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8">
            <input
              type="file"
              class="hidden"
              @change="handleFileSelect"
            />
            <n-button
              type="primary"
              size="large"
              @click="($refs.fileInput as HTMLInputElement).click()"
            >
              选择文件
            </n-button>
            <div v-if="selectedFile" class="mt-4 text-center">
              <div class="font-medium">{{ selectedFile.name }}</div>
              <div class="text-sm text-gray-500">{{ formatFileSize(selectedFile.size) }}</div>
            </div>
            <div v-else class="mt-4 text-gray-400">
              未选择文件
            </div>
          </div>

          <!-- Progress bar -->
          <n-progress
            v-if="isComputing"
            type="line"
            :percentage="fileProgress"
            :show-indicator="true"
            style="margin-top: 16px"
          />

          <n-button
            type="primary"
            size="large"
            block
            :disabled="!selectedFile || isComputing"
            style="margin-top: 16px"
            @click="calculateHash"
          >
            {{ isComputing ? '计算中...' : '计算哈希' }}
          </n-button>
        </template>
      </div>
    </template>

    <!-- Output -->
    <template #output-header>
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
        哈希结果
      </span>
    </template>

    <template #output-actions>
      <n-button
        v-if="hashResult"
        type="info"
        size="small"
        @click="copyResult"
      >
        <template #icon>
          <span>📄</span>
        </template>
        复制
      </n-button>
    </template>

    <template #output>
      <div class="h-full flex flex-col justify-center space-y-4">
        <n-input
          v-model:value="hashResult"
          type="textarea"
          :rows="4"
          readonly
          class="font-mono text-sm"
          placeholder="哈希结果将显示在这里"
        />

        <!-- Verify section -->
        <div>
          <n-divider>
            <span class="text-xs text-gray-500">校验</span>
          </n-divider>
          <div class="flex gap-2">
            <n-input
              v-model:value="verifyInput"
              type="text"
              placeholder="输入待校验的哈希值..."
              class="font-mono text-sm flex-1"
              @keyup.enter="verifyHash"
            />
            <n-button type="primary" size="small" @click="verifyHash">
              校验
            </n-button>
          </div>
          <div v-if="verifyResult" class="mt-2">
            <n-tag
              v-if="verifyResult === 'match'"
              type="success"
              size="small"
            >
              ✓ 匹配
            </n-tag>
            <n-tag
              v-else
              type="error"
              size="small"
            >
              ✗ 不匹配
            </n-tag>
          </div>
        </div>
      </div>
    </template>
  </ToolLayout>
</template>
