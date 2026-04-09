<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useMessage } from 'naive-ui'
import ToolLayout from '@/components/toolbox/ToolLayout.vue'

const message = useMessage()

const minute = ref('0')
const hour = ref('8')
const dayOfMonth = ref('*')
const month = ref('*')
const dayOfWeek = ref('1-5')

const reverseMode = ref(false)
const reverseHour = ref(8)
const reverseMinute = ref(0)
const reverseDayOfWeek = ref(1)

const cronExpression = ref('0 8 * * 1-5')

watch([minute, hour, dayOfMonth, month, dayOfWeek], () => {
  cronExpression.value = `${minute.value} ${hour.value} ${dayOfMonth.value} ${month.value} ${dayOfWeek.value}`
})

const cronExplanation = computed(() => {
  try {
    return explainCron(cronExpression.value)
  } catch {
    return null
  }
})

function explainCron(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error('无效格式')

  const [min, hr, dom, mon, dow] = parts
  const explanations: string[] = []

  if (min === '*') explanations.push('每分钟')
  else if (min.startsWith('*/')) explanations.push(`每${min.slice(2)}分钟`)
  else explanations.push(`第${min}分钟`)

  if (hr === '*') explanations.push('每小时')
  else if (hr.startsWith('*/')) explanations.push(`每${hr.slice(2)}小时`)
  else explanations.push(`${hr}点`)

  if (dom !== '*') {
    if (dom.startsWith('*/')) explanations.push(`每${dom.slice(2)}天`)
    else explanations.push(`${dom}号`)
  }

  if (mon !== '*') explanations.push(`${mon}月`)

  if (dow !== '*') {
    const dayNames: Record<string, string> = {
      '0': '周日', '1': '周一', '2': '周二', '3': '周三',
      '4': '周四', '5': '周五', '6': '周六', '7': '周日'
    }
    if (dow.includes('-')) {
      const [start, end] = dow.split('-')
      explanations.push(`${dayNames[start]}至${dayNames[end]}`)
    } else if (dow.includes(',')) {
      const days = dow.split(',').map(d => dayNames[d] || d).join('、')
      explanations.push(days)
    } else {
      explanations.push(dayNames[dow] || `周${dow}`)
    }
  }

  return explanations.join('，')
}

const fieldDescriptions = computed(() => {
  return [
    { field: '分', range: '0-59', value: minute.value, desc: '分钟' },
    { field: '时', range: '0-23', value: hour.value, desc: '小时' },
    { field: '日', range: '1-31', value: dayOfMonth.value, desc: '日期' },
    { field: '月', range: '1-12', value: month.value, desc: '月份' },
    { field: '周', range: '0-6', value: dayOfWeek.value, desc: '星期' }
  ]
})

const nextRuns = computed(() => {
  try {
    return calculateNextRuns(cronExpression.value, 5)
  } catch {
    return []
  }
})

function calculateNextRuns(expr: string, count: number): string[] {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error('无效格式')

  const [minPat, hourPat, domPat, monPat, dowPat] = parts
  const results: string[] = []
  const now = new Date()
  let current = new Date(now)
  current.setSeconds(0)
  current.setMilliseconds(0)

  const maxIterations = 5000
  let iterations = 0

  while (results.length < count && iterations < maxIterations) {
    iterations++
    current = new Date(current.getTime() + 60000)

    if (!matchesPattern(current.getMinutes(), minPat)) continue
    if (!matchesPattern(current.getHours(), hourPat)) continue
    if (!matchesPattern(current.getDate(), domPat)) continue
    if (!matchesPattern(current.getMonth() + 1, monPat)) continue
    if (!matchesPattern(current.getDay(), dowPat)) continue

    results.push(formatDateTime(current))
  }

  return results
}

function matchesPattern(value: number, pattern: string): boolean {
  if (pattern === '*') return true
  if (pattern.startsWith('*/')) {
    const step = parseInt(pattern.slice(2))
    return value % step === 0
  }
  if (pattern.includes(',')) {
    return pattern.split(',').some(p => matchesPattern(value, p.trim()))
  }
  if (pattern.includes('-')) {
    const [start, end] = pattern.split('-').map(Number)
    return value >= start && value <= end
  }
  return parseInt(pattern) === value
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} ${weekDays[date.getDay()]}`
}

watch([reverseMode, reverseHour, reverseMinute, reverseDayOfWeek], () => {
  if (reverseMode.value) {
    minute.value = String(reverseMinute.value).padStart(2, '0')
    hour.value = String(reverseHour.value).padStart(2, '0')
    dayOfMonth.value = '*'
    month.value = '*'
    dayOfWeek.value = reverseDayOfWeek.value === -1 ? '*' : String(reverseDayOfWeek.value)
  }
})

const templates = [
  { label: '每天', cron: '0 0 * * *', desc: '每天午夜' },
  { label: '每周一', cron: '0 0 * * 1', desc: '每周一00:00' },
  { label: '每月1号', cron: '0 0 1 * *', desc: '每月1号00:00' },
  { label: '每15分钟', cron: '*/15 * * * *', desc: '每15分钟' },
  { label: '每小时', cron: '0 * * * *', desc: '每小时' }
]

function applyTemplate(cron: string) {
  const parts = cron.split(' ')
  if (parts.length === 5) {
    minute.value = parts[0]
    hour.value = parts[1]
    dayOfMonth.value = parts[2]
    month.value = parts[3]
    dayOfWeek.value = parts[4]
    message.success(`已应用: ${cron}`)
  }
}

async function copyCron() {
  try {
    await navigator.clipboard.writeText(cronExpression.value)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

function clearAll() {
  minute.value = '0'
  hour.value = '8'
  dayOfMonth.value = '*'
  month.value = '*'
  dayOfWeek.value = '1-5'
  reverseHour.value = 8
  reverseMinute.value = 0
  reverseDayOfWeek.value = 1
}

const isValid = computed(() => {
  try {
    const parts = cronExpression.value.trim().split(/\s+/)
    if (parts.length !== 5) return false

    const [min, hr, dom, mon, dow] = parts

    if (!isValidField(min, 0, 59)) return false
    if (!isValidField(hr, 0, 23)) return false
    if (!isValidField(dom, 1, 31)) return false
    if (!isValidField(mon, 1, 12)) return false
    if (!isValidField(dow, 0, 6)) return false

    return true
  } catch {
    return false
  }
})

function isValidField(pattern: string, min: number, max: number): boolean {
  if (pattern === '*') return true
  if (pattern.startsWith('*/')) {
    const step = parseInt(pattern.slice(2))
    return !isNaN(step) && step > 0
  }
  if (pattern.includes(',')) {
    return pattern.split(',').every(p => isValidField(p.trim(), min, max))
  }
  if (pattern.includes('-')) {
    const [start, end] = pattern.split('-').map(Number)
    return !isNaN(start) && !isNaN(end) && start >= min && end <= max
  }
  const num = parseInt(pattern)
  return !isNaN(num) && num >= min && num <= max
}

function syncExpressionToFields(expr: string) {
  const parts = expr.trim().split(/\s+/)
  if (parts.length === 5) {
    minute.value = parts[0]
    hour.value = parts[1]
    dayOfMonth.value = parts[2]
    month.value = parts[3]
    dayOfWeek.value = parts[4]
  }
}

const statusText = computed(() => {
  if (!isValid.value && !reverseMode.value) return '表达式格式有误，请检查'
  return '支持 * / - , 等特殊字符，如 */15 表示每15个单位'
})
</script>

<template>
  <ToolLayout title="Cron 表达式" :status="statusText">
    <!-- Toolbar -->
    <template #toolbar>
      <n-button-group>
        <n-button
          :type="!reverseMode ? 'primary' : 'default'"
          size="small"
          @click="reverseMode = false"
        >
          Cron → 时间
        </n-button>
        <n-button
          :type="reverseMode ? 'primary' : 'default'"
          size="small"
          @click="reverseMode = true"
        >
          时间 → Cron
        </n-button>
      </n-button-group>

      <n-divider vertical />

      <template v-if="!reverseMode">
        <n-button size="small" @click="applyTemplate(t.cron)" v-for="t in templates" :key="t.label">
          {{ t.label }}
        </n-button>
      </template>

      <n-divider vertical />

      <n-button size="small" @click="clearAll">
        <template #icon>
          <span>🗑️</span>
        </template>
        清空
      </n-button>

      <n-button type="info" size="small" @click="copyCron">
        <template #icon>
          <span>📄</span>
        </template>
        复制
      </n-button>
    </template>

    <!-- Input -->
    <template #input-header>
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
        {{ reverseMode ? '选择时间' : 'Cron 表达式' }}
      </span>
    </template>

    <template #input>
      <div class="h-full overflow-auto p-4">
        <!-- Reverse Mode -->
        <template v-if="reverseMode">
          <div class="mb-4">
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-2">选择周期</label>
            <n-select
              v-model:value="reverseDayOfWeek"
              :options="[
                { label: '每天', value: -1 },
                { label: '周日', value: 0 },
                { label: '周一', value: 1 },
                { label: '周二', value: 2 },
                { label: '周三', value: 3 },
                { label: '周四', value: 4 },
                { label: '周五', value: 5 },
                { label: '周六', value: 6 }
              ]"
              size="large"
            />
          </div>
          <div class="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label class="block text-sm text-gray-600 dark:text-gray-400 mb-2">小时</label>
              <n-input-number v-model:value="reverseHour" :min="0" :max="23" size="large" />
            </div>
            <div>
              <label class="block text-sm text-gray-600 dark:text-gray-400 mb-2">分钟</label>
              <n-input-number v-model:value="reverseMinute" :min="0" :max="59" size="large" />
            </div>
          </div>
        </template>

        <!-- Forward Mode -->
        <template v-else>
          <div class="mb-4">
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-2">Cron 表达式</label>
            <n-input
              v-model:value="cronExpression"
              type="text"
              placeholder="* * * * *"
              size="large"
              class="font-mono text-lg"
              @change="syncExpressionToFields"
            />
          </div>

          <div class="text-xs text-gray-500 dark:text-gray-400 mb-4">
            格式: 分(0-59) 时(0-23) 日(1-31) 月(1-12) 周(0-6)
          </div>

          <div class="grid grid-cols-5 gap-2">
            <div v-for="fd in fieldDescriptions" :key="fd.field">
              <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                {{ fd.field }} ({{ fd.range }})
              </label>
              <n-input v-model:value="fd.value" size="small" class="font-mono" />
            </div>
          </div>
        </template>
      </div>
    </template>

    <!-- Output -->
    <template #output-header>
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">结果</span>
    </template>

    <template #output-actions>
      <n-tag v-if="!reverseMode" :type="isValid ? 'success' : 'error'" size="small">
        {{ isValid ? '有效' : '无效' }}
      </n-tag>
    </template>

    <template #output>
      <div class="h-full overflow-auto p-4">
        <!-- Expression Meaning -->
        <template v-if="!reverseMode && cronExplanation">
          <div class="mb-6">
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">表达含义</h3>
            <div class="text-lg text-gray-900 dark:text-white">
              {{ cronExplanation }}
            </div>
          </div>
        </template>

        <!-- Next Runs -->
        <template v-if="!reverseMode && nextRuns.length > 0">
          <div class="mb-6">
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">最近执行时间</h3>
            <div class="space-y-1">
              <div
                v-for="(run, idx) in nextRuns"
                :key="idx"
                class="text-sm font-mono text-gray-600 dark:text-gray-400"
              >
                {{ idx + 1 }}. {{ run }}
              </div>
            </div>
          </div>
        </template>

        <!-- Reverse Mode Result -->
        <template v-if="reverseMode">
          <div>
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">生成的表达式</h3>
            <div class="text-2xl font-mono text-gray-900 dark:text-white mb-4">
              {{ cronExpression }}
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-400">
              {{ cronExplanation }}
            </div>
          </div>
        </template>
      </div>
    </template>
  </ToolLayout>
</template>
