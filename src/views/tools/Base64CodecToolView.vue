<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import ToolLayout from '@/components/toolbox/ToolLayout.vue'

const message = useMessage()

type TransformMode = 'encode' | 'decode'

const textInput = ref('')
const base64Input = ref('')
const encodeResult = ref('')
const decodeResult = ref('')
const mode = ref<TransformMode>('encode')
const useUrlSafe = ref(false)
const error = ref('')

const isEncodeMode = computed(() => mode.value === 'encode')

function btoaUtf8(str: string): string {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))))
}

function atobUtf8(str: string): string {
  return decodeURIComponent(atob(str).split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''))
}

function toBase64(str: string, urlSafe: boolean): string {
  const encoded = btoaUtf8(str)
  if (urlSafe) {
    return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  return encoded
}

function fromBase64(str: string, urlSafe: boolean): string {
  let normalized = str
  if (urlSafe) {
    normalized = str.replace(/-/g, '+').replace(/_/g, '/')
    while (normalized.length % 4) {
      normalized += '='
    }
  }
  return atobUtf8(normalized)
}

function encodeText() {
  error.value = ''
  const input = textInput.value

  if (!input) {
    error.value = '请输入文本内容'
    return
  }

  try {
    encodeResult.value = toBase64(input, useUrlSafe.value)
  } catch (e) {
    error.value = '编码失败：无效的字符'
    message.error('编码失败')
  }
}

function decodeText() {
  error.value = ''
  const input = base64Input.value.trim()

  if (!input) {
    error.value = '请输入 Base64 内容'
    return
  }

  try {
    decodeResult.value = fromBase64(input, useUrlSafe.value)
  } catch (e) {
    error.value = '解码失败：无效的 Base64 格式'
    message.error('解码失败：无效的 Base64 格式')
  }
}

async function copyEncodeResult() {
  if (!encodeResult.value) {
    message.warning('没有可复制的内容')
    return
  }
  try {
    await navigator.clipboard.writeText(encodeResult.value)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

async function copyDecodeResult() {
  if (!decodeResult.value) {
    message.warning('没有可复制的内容')
    return
  }
  try {
    await navigator.clipboard.writeText(decodeResult.value)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

function clearAll() {
  textInput.value = ''
  base64Input.value = ''
  encodeResult.value = ''
  decodeResult.value = ''
  error.value = ''
}

function swapContent() {
  if (isEncodeMode.value && encodeResult.value) {
    mode.value = 'decode'
    base64Input.value = encodeResult.value
    encodeResult.value = ''
    textInput.value = ''
  } else if (!isEncodeMode.value && decodeResult.value) {
    mode.value = 'encode'
    textInput.value = decodeResult.value
    base64Input.value = ''
    decodeResult.value = ''
  }
}

const statusText = computed(() => {
  if (error.value) return error.value
  return useUrlSafe.value ? '使用 URL-safe Base64 编码' : '标准 Base64 编码，支持 UTF-8 中文'
})
</script>

<template>
  <ToolLayout title="Base64 编解码" :status="statusText">
    <!-- Toolbar -->
    <template #toolbar>
      <n-button-group>
        <n-button
          :type="mode === 'encode' ? 'primary' : 'default'"
          size="small"
          @click="mode = 'encode'"
        >
          编码
        </n-button>
        <n-button
          :type="mode === 'decode' ? 'primary' : 'default'"
          size="small"
          @click="mode = 'decode'"
        >
          解码
        </n-button>
      </n-button-group>

      <n-divider vertical />

      <n-checkbox v-model:checked="useUrlSafe" size="small">
        URL-safe
      </n-checkbox>

      <n-divider vertical />

      <n-button size="small" @click="clearAll">
        <template #icon>
          <span>🗑️</span>
        </template>
        清空
      </n-button>

      <n-button
        v-if="(isEncodeMode && encodeResult) || (!isEncodeMode && decodeResult)"
        size="small"
        @click="swapContent"
      >
        <template #icon>
          <span>⇄</span>
        </template>
        互换
      </n-button>
    </template>

    <!-- Input -->
    <template #input-header>
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
        {{ isEncodeMode ? '文本输入' : 'Base64 输入' }}
      </span>
    </template>

    <template #input>
      <div class="h-full flex flex-col justify-center">
        <n-input
          v-if="isEncodeMode"
          v-model:value="textInput"
          type="textarea"
          placeholder="请输入要编码的文本，支持中文..."
          :rows="8"
          class="font-mono text-sm"
          @keyup.enter.ctrl="encodeText"
        />
        <n-input
          v-else
          v-model:value="base64Input"
          type="textarea"
          placeholder="请输入 Base64 字符串..."
          :rows="8"
          class="font-mono text-sm"
          @keyup.enter.ctrl="decodeText"
        />
        <n-button
          type="primary"
          size="large"
          block
          style="margin-top: 16px"
          @click="isEncodeMode ? encodeText() : decodeText()"
        >
          {{ isEncodeMode ? '编码' : '解码' }}
        </n-button>
      </div>
    </template>

    <!-- Output -->
    <template #output-header>
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
        {{ isEncodeMode ? 'Base64 输出' : '文本输出' }}
      </span>
    </template>

    <template #output-actions>
      <n-tag v-if="error" type="error" size="small">错误</n-tag>
      <n-tag v-else-if="(isEncodeMode ? encodeResult : decodeResult)" type="success" size="small">有效</n-tag>
      <n-button
        v-if="isEncodeMode ? encodeResult : decodeResult"
        type="info"
        size="small"
        @click="isEncodeMode ? copyEncodeResult() : copyDecodeResult()"
      >
        <template #icon>
          <span>📄</span>
        </template>
        复制
      </n-button>
    </template>

    <template #output>
      <div class="h-full flex flex-col justify-center">
        <n-input
          v-if="isEncodeMode"
          v-model:value="encodeResult"
          type="textarea"
          :rows="8"
          readonly
          class="font-mono text-sm"
          placeholder="编码结果将显示在这里"
        />
        <n-input
          v-else
          v-model:value="decodeResult"
          type="textarea"
          :rows="8"
          readonly
          class="font-mono text-sm"
          placeholder="解码结果将显示在这里"
        />
      </div>
    </template>
  </ToolLayout>
</template>
