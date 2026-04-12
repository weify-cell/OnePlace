<script setup lang="ts">
import { ref, computed, h } from 'vue'
import { useMessage, NButton, NButtonGroup, NCheckbox, NInput, NTag, NDataTable, NDivider } from 'naive-ui'
import ToolLayout from '@/components/toolbox/ToolLayout.vue'

const message = useMessage()

type TransformMode = 'encode' | 'decode' | 'parse'
type EncodeMode = 'component' | 'standard'

const textInput = ref('')
const encodeResult = ref('')
const decodeResult = ref('')
const mode = ref<TransformMode>('encode')
const encodeMode = ref<EncodeMode>('component')
const error = ref('')

// URL Parse state
const parsedUrl = ref({
  protocol: '',
  host: '',
  path: '',
  queryString: ''
})
interface QueryParam {
  key: string
  value: string
}
const queryParams = ref<QueryParam[]>([])
const urlPreview = ref('')

const HISTORY_KEY = 'oneplace_url_history'
const MAX_HISTORY = 20

const history = ref<string[]>([])

function loadHistory() {
  try {
    const stored = localStorage.getItem(HISTORY_KEY)
    if (stored) {
      history.value = JSON.parse(stored)
    }
  } catch {
    history.value = []
  }
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value))
  } catch {
    // ignore
  }
}

function addToHistory(text: string, _type?: 'encode' | 'decode') {
  if (!text.trim()) return
  const idx = history.value.indexOf(text)
  if (idx !== -1) {
    history.value.splice(idx, 1)
  }
  history.value.unshift(text)
  if (history.value.length > MAX_HISTORY) {
    history.value = history.value.slice(0, MAX_HISTORY)
  }
  saveHistory()
}

function clearHistory() {
  history.value = []
  saveHistory()
}

function useHistoryItem(text: string) {
  textInput.value = text
  if (mode.value === 'parse') {
    parseUrl(text)
  }
}

function encodeText() {
  error.value = ''
  const input = textInput.value

  if (!input) {
    error.value = '请输入内容'
    return
  }

  try {
    if (encodeMode.value === 'component') {
      encodeResult.value = encodeURIComponent(input)
    } else {
      encodeResult.value = encodeURI(input)
    }
    addToHistory(encodeResult.value, 'encode')
  } catch (e) {
    error.value = '编码失败'
    message.error('编码失败')
  }
}

function decodeText() {
  error.value = ''
  const input = textInput.value.trim()

  if (!input) {
    error.value = '请输入内容'
    return
  }

  try {
    if (encodeMode.value === 'component') {
      decodeResult.value = decodeURIComponent(input)
    } else {
      decodeResult.value = decodeURI(input)
    }
    addToHistory(decodeResult.value, 'decode')
  } catch (e) {
    error.value = '解码失败：无效的编码字符串'
    message.error('解码失败：无效的编码字符串')
  }
}

const isEncodeMode = computed(() => mode.value === 'encode')
const isDecodeMode = computed(() => mode.value === 'decode')
const isParseMode = computed(() => mode.value === 'parse')

function parseUrl(url: string) {
  error.value = ''
  try {
    let urlObj: URL
    try {
      urlObj = new URL(url)
    } catch {
      // Try with https:// prefix if no protocol
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        urlObj = new URL('https://' + url)
      } else {
        throw new Error('Invalid URL')
      }
    }

    parsedUrl.value = {
      protocol: urlObj.protocol.replace(':', ''),
      host: urlObj.host,
      path: urlObj.pathname,
      queryString: urlObj.search.slice(1)
    }

    // Parse query params
    queryParams.value = []
    urlObj.searchParams.forEach((value, key) => {
      queryParams.value.push({ key, value })
    })

    updateUrlPreview()
    addToHistory(url)
  } catch (e) {
    error.value = 'URL 解析失败：无效的 URL 格式'
    message.error('URL 解析失败：无效的 URL 格式')
  }
}

function updateUrlPreview() {
  const params = queryParams.value
    .filter(p => p.key.trim())
    .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&')
  const query = params ? `?${params}` : ''
  urlPreview.value = `${parsedUrl.value.protocol}://${parsedUrl.value.host}${parsedUrl.value.path}${query}`
}

// updateUrlPreview is called manually after queryParams mutations (add/remove/update)

function removeQueryParam(index: number) {
  queryParams.value.splice(index, 1)
  updateUrlPreview()
}

function addQueryParam() {
  queryParams.value.push({ key: '', value: '' })
  updateUrlPreview()
}

const queryColumns = [
  { title: '参数名', key: 'key', width: 150 },
  { title: '参数值', key: 'value' },
  {
    title: '操作',
    key: 'actions',
    width: 80,
    render(row: QueryParam, index: number) {
      return h(NButton, {
        size: 'small',
        type: 'error',
        onClick: () => removeQueryParam(index)
      }, { default: () => '删除' })
    }
  }
]

function handleParseInput() {
  const input = textInput.value.trim()
  if (!input) {
    error.value = '请输入 URL'
    return
  }
  parseUrl(input)
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

async function copyUrlPreview() {
  if (!urlPreview.value) {
    message.warning('没有可复制的内容')
    return
  }
  try {
    await navigator.clipboard.writeText(urlPreview.value)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

function clearAll() {
  textInput.value = ''
  encodeResult.value = ''
  decodeResult.value = ''
  error.value = ''
  parsedUrl.value = { protocol: '', host: '', path: '', queryString: '' }
  queryParams.value = []
  urlPreview.value = ''
}

function swapContent() {
  if (isEncodeMode.value && encodeResult.value) {
    mode.value = 'decode'
    textInput.value = encodeResult.value
    encodeResult.value = ''
  } else if (isDecodeMode.value && decodeResult.value) {
    mode.value = 'encode'
    textInput.value = decodeResult.value
    decodeResult.value = ''
  }
}

const statusText = computed(() => {
  if (error.value) return error.value
  if (mode.value === 'parse') return 'URL 解析模式'
  return encodeMode.value === 'component' ? 'Component 模式（编码特殊字符）' : 'Standard 模式（保留 URI 合法字符）'
})

loadHistory()
</script>

<template>
  <ToolLayout title="URL 编解码" :status="statusText">
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
        <n-button
          :type="mode === 'parse' ? 'primary' : 'default'"
          size="small"
          @click="mode = 'parse'"
        >
          URL解析
        </n-button>
      </n-button-group>

      <n-divider vertical />

      <n-button-group v-if="mode !== 'parse'">
        <n-button
          :type="encodeMode === 'component' ? 'primary' : 'default'"
          size="small"
          @click="encodeMode = 'component'"
        >
          Component
        </n-button>
        <n-button
          :type="encodeMode === 'standard' ? 'primary' : 'default'"
          size="small"
          @click="encodeMode = 'standard'"
        >
          Standard
        </n-button>
      </n-button-group>

      <n-divider vertical />

      <n-button size="small" @click="clearAll">
        <template #icon>
          <span>🗑️</span>
        </template>
        清空
      </n-button>

      <n-button
        v-if="mode !== 'parse' && ((isEncodeMode && encodeResult) || (isDecodeMode && decodeResult))"
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
        <template v-if="mode === 'encode'">原文输入</template>
        <template v-else-if="mode === 'decode'">编码输入</template>
        <template v-else>URL 输入</template>
      </span>
      <n-tag v-if="history.length > 0" type="info" size="small" style="margin-left: 8px">
        {{ history.length }} 条历史
      </n-tag>
    </template>

    <template #input>
      <div class="h-full flex flex-col justify-center">
        <n-input
          v-model:value="textInput"
          type="textarea"
          :placeholder="mode === 'parse' ? '请输入要解析的 URL...' : '请输入内容...'"
          :rows="8"
          class="font-mono text-sm"
          @keyup.enter.ctrl="mode === 'encode' ? encodeText() : mode === 'decode' ? decodeText() : handleParseInput()"
        />
        <n-button
          type="primary"
          size="large"
          block
          style="margin-top: 16px"
          @click="mode === 'encode' ? encodeText() : mode === 'decode' ? decodeText() : handleParseInput()"
        >
          {{ mode === 'encode' ? '编码' : mode === 'decode' ? '解码' : '解析' }}
        </n-button>

        <!-- History dropdown -->
        <div v-if="history.length > 0" style="margin-top: 12px">
          <div class="text-xs text-gray-500 mb-2">历史记录（点击回填）</div>
          <div class="flex flex-wrap gap-2">
            <n-tag
              v-for="(item, idx) in history.slice(0, 10)"
              :key="idx"
              size="small"
              class="cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900 font-mono text-xs"
              @click="useHistoryItem(item)"
            >
              {{ item.length > 30 ? item.slice(0, 30) + '...' : item }}
            </n-tag>
          </div>
          <n-button size="tiny" type="error" tertiary style="margin-top: 8px" @click="clearHistory">
            清空历史
          </n-button>
        </div>
      </div>
    </template>

    <!-- Output -->
    <template #output-header>
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
        <template v-if="mode === 'encode'">编码输出</template>
        <template v-else-if="mode === 'decode'">解码输出</template>
        <template v-else>解析结果</template>
      </span>
    </template>

    <template #output-actions>
      <n-tag v-if="error" type="error" size="small">错误</n-tag>
      <n-tag
        v-else-if="(mode === 'encode' ? encodeResult : mode === 'decode' ? decodeResult : urlPreview)"
        type="success"
        size="small"
      >有效</n-tag>
      <n-button
        v-if="mode === 'encode' ? encodeResult : mode === 'decode' ? decodeResult : urlPreview"
        type="info"
        size="small"
        @click="mode === 'encode' ? copyEncodeResult() : mode === 'decode' ? copyDecodeResult() : copyUrlPreview()"
      >
        <template #icon>
          <span>📄</span>
        </template>
        复制
      </n-button>
    </template>

    <template #output>
      <div class="h-full flex flex-col justify-center">
        <!-- Encode/Decode Output -->
        <n-input
          v-if="mode !== 'parse'"
          :value="mode === 'encode' ? encodeResult : decodeResult"
          type="textarea"
          :rows="8"
          readonly
          class="font-mono text-sm"
          :placeholder="mode === 'encode' ? '编码结果将显示在这里' : '解码结果将显示在这里'"
        />

        <!-- URL Parse Output -->
        <div v-else class="space-y-4">
          <div v-if="parsedUrl.protocol || parsedUrl.host" class="space-y-3">
            <div>
              <div class="text-xs text-gray-500 mb-1">协议</div>
              <n-input v-model:value="parsedUrl.protocol" class="font-mono text-sm" readonly />
            </div>
            <div>
              <div class="text-xs text-gray-500 mb-1">主机</div>
              <n-input v-model:value="parsedUrl.host" class="font-mono text-sm" readonly />
            </div>
            <div>
              <div class="text-xs text-gray-500 mb-1">路径</div>
              <n-input v-model:value="parsedUrl.path" class="font-mono text-sm" readonly />
            </div>
            <n-divider>查询参数</n-divider>
            <n-data-table
              :columns="queryColumns"
              :data="queryParams"
              :bordered="false"
              size="small"
              :pagination="false"
              max-height="200"
            />
            <n-button size="small" block @click="addQueryParam">
              + 添加参数
            </n-button>
            <div>
              <div class="text-xs text-gray-500 mb-1">URL 预览</div>
              <n-input v-model:value="urlPreview" type="textarea" :rows="2" class="font-mono text-sm" />
            </div>
          </div>
          <div v-else class="text-gray-400 text-center py-8">
            解析结果将显示在这里
          </div>
        </div>
      </div>
    </template>
  </ToolLayout>
</template>
