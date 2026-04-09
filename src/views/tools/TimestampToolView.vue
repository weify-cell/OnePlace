<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import ToolLayout from '@/components/toolbox/ToolLayout.vue'

const message = useMessage()

type Precision = 'ms' | 's'
type TransformMode = 'toDateTime' | 'toTimestamp'

const timestampInput = ref('')
const datetimeInput = ref('')
const timestampResult = ref('')
const datetimeResult = ref('')
const precision = ref<Precision>('ms')
const mode = ref<TransformMode>('toDateTime')
const error = ref('')

const isTimestampMode = computed(() => mode.value === 'toDateTime')

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function timestampToDatetime() {
  error.value = ''
  const input = timestampInput.value.trim()

  if (!input) {
    error.value = '请输入时间戳'
    return
  }

  const num = Number(input)
  if (isNaN(num)) {
    error.value = '无效的时间戳格式'
    message.error('格式错误: 请输入数字')
    return
  }

  let date: Date
  if (precision.value === 'ms') {
    date = new Date(num)
  } else {
    date = new Date(num * 1000)
  }

  if (isNaN(date.getTime())) {
    error.value = '无效的时间戳值'
    message.error('无效的时间戳')
    return
  }

  datetimeResult.value = formatDateTime(date)
}

function datetimeToTimestamp() {
  error.value = ''
  const input = datetimeInput.value.trim()

  if (!input) {
    error.value = '请输入日期时间'
    return
  }

  const date = new Date(input)
  if (isNaN(date.getTime())) {
    error.value = '无效的日期时间格式'
    message.error('无效的日期时间格式')
    return
  }

  const ts = date.getTime()
  timestampResult.value = precision.value === 'ms' ? String(ts) : String(Math.floor(ts / 1000))
}

function fillCurrentTimestamp() {
  const now = Date.now()
  timestampInput.value = String(now)
  timestampResult.value = ''
  error.value = ''
}

function fillCurrentDatetime() {
  datetimeInput.value = formatDateTime(new Date())
  timestampResult.value = ''
  error.value = ''
}

async function copyResult() {
  const text = isTimestampMode() ? datetimeResult.value : timestampResult.value
  if (!text) {
    message.warning('没有可复制的内容')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

function clearAll() {
  timestampInput.value = ''
  datetimeInput.value = ''
  timestampResult.value = ''
  datetimeResult.value = ''
  error.value = ''
}

const statusText = computed(() => {
  if (error.value) return error.value
  return '支持毫秒/秒级时间戳，默认毫秒精度'
})
</script>

<template>
  <ToolLayout title="时间戳转换" :status="statusText">
    <!-- Toolbar -->
    <template #toolbar>
      <n-button-group>
        <n-button
          :type="mode === 'toDateTime' ? 'primary' : 'default'"
          size="small"
          @click="mode = 'toDateTime'"
        >
          时间戳 → 日期
        </n-button>
        <n-button
          :type="mode === 'toTimestamp' ? 'primary' : 'default'"
          size="small"
          @click="mode = 'toTimestamp'"
        >
          日期 → 时间戳
        </n-button>
      </n-button-group>

      <n-divider vertical />

      <n-select
        v-model:value="precision"
        :options="[
          { label: '毫秒', value: 'ms' },
          { label: '秒', value: 's' }
        ]"
        size="small"
        style="width: 100px"
      />

      <n-divider vertical />

      <n-button size="small" @click="isTimestampMode ? fillCurrentTimestamp() : fillCurrentDatetime()">
        <template #icon>
          <span>🕐</span>
        </template>
        当前时间
      </n-button>

      <n-button size="small" @click="clearAll">
        <template #icon>
          <span>🗑️</span>
        </template>
        清空
      </n-button>

      <n-button type="info" size="small" @click="copyResult">
        <template #icon>
          <span>📄</span>
        </template>
        复制结果
      </n-button>
    </template>

    <!-- Input -->
    <template #input-header>
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
        {{ isTimestampMode ? '时间戳输入' : '日期时间输入' }}
      </span>
    </template>

    <template #input>
      <div class="h-full flex flex-col justify-center">
        <n-input
          v-if="isTimestampMode"
          v-model:value="timestampInput"
          type="text"
          placeholder="请输入时间戳，如 1712236800000"
          size="large"
          @keyup.enter="timestampToDatetime"
        />
        <n-input
          v-else
          v-model:value="datetimeInput"
          type="text"
          placeholder="请输入日期时间，如 2024-04-04 00:00:00"
          size="large"
          @keyup.enter="datetimeToTimestamp"
        />
        <n-button
          type="primary"
          size="large"
          block
          style="margin-top: 16px"
          @click="isTimestampMode ? timestampToDatetime() : datetimeToTimestamp()"
        >
          转换
        </n-button>
      </div>
    </template>

    <!-- Output -->
    <template #output-header>
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
        {{ isTimestampMode ? '日期时间结果' : '时间戳结果' }}
      </span>
    </template>

    <template #output-actions>
      <n-tag v-if="error" type="error" size="small">错误</n-tag>
      <n-tag v-else-if="(isTimestampMode ? datetimeResult : timestampResult)" type="success" size="small">有效</n-tag>
    </template>

    <template #output>
      <div class="h-full flex flex-col justify-center">
        <div
          v-if="isTimestampMode ? datetimeResult : timestampResult"
          class="text-2xl font-mono text-center text-gray-900 dark:text-white break-all"
        >
          {{ isTimestampMode ? datetimeResult : timestampResult }}
        </div>
        <div v-else class="text-gray-400 text-center">
          转换结果将显示在这里
        </div>
      </div>
    </template>
  </ToolLayout>
</template>
