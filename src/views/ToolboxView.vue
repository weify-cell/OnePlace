<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '@/components/common/AppLayout.vue'
import ToolCard from '@/components/toolbox/ToolCard.vue'

const router = useRouter()

type ToolStatus = 'available' | 'coming-soon'
type ToolCategory = 'all' | 'time' | 'codec' | 'json' | 'image' | 'diff'

interface Tool {
  id: string
  name: string
  description: string
  icon: string
  path: string
  category: ToolCategory
  status: ToolStatus
}

const currentTab = ref<ToolCategory>('all')

const tools: Tool[] = [
  {
    id: 'json',
    name: 'JSON 格式化',
    description: '格式化、压缩、验证、转义、去转义',
    icon: '📝',
    path: '/toolbox/json',
    category: 'json',
    status: 'available'
  },
  {
    id: 'image-base64',
    name: '图片 Base64',
    description: '图片与 Base64 互转，支持拖拽和粘贴',
    icon: '🖼️',
    path: '/toolbox/image-base64',
    category: 'image',
    status: 'available'
  },
  {
    id: 'text-diff',
    name: '文本比较',
    description: '逐字符比较文本差异，适合文案校对',
    icon: '📊',
    path: '/toolbox/text-diff',
    category: 'diff',
    status: 'available'
  },
  {
    id: 'timestamp',
    name: '时间戳转换',
    description: 'Unix 时间戳与日期时间互转',
    icon: '⏰',
    path: '/toolbox/timestamp',
    category: 'time',
    status: 'available'
  },
  {
    id: 'crontab',
    name: 'Cron 表达式',
    description: 'Cron 表达式与时间互转，可视化下次执行时间',
    icon: '🔄',
    path: '/toolbox/crontab',
    category: 'time',
    status: 'available'
  },
  {
    id: 'date-calc',
    name: '日期计算',
    description: '计算日期差、添加减少时间',
    icon: '📅',
    path: '',
    category: 'time',
    status: 'coming-soon'
  },
  {
    id: 'base64-codec',
    name: 'Base64 编解码',
    description: '文本 Base64 编码和解码',
    icon: '🔐',
    path: '',
    category: 'codec',
    status: 'coming-soon'
  },
  {
    id: 'url-codec',
    name: 'URL 编解码',
    description: 'URL 编码和解码',
    icon: '🔗',
    path: '',
    category: 'codec',
    status: 'coming-soon'
  },
  {
    id: 'hash',
    name: '哈希计算',
    description: 'MD5、SHA1、SHA256 等哈希算法',
    icon: '#️⃣',
    path: '',
    category: 'codec',
    status: 'coming-soon'
  }
]

const filteredTools = computed(() => {
  if (currentTab.value === 'all') {
    return tools
  }
  return tools.filter(tool => tool.category === currentTab.value)
})

function navigateToTool(tool: Tool) {
  if (tool.status === 'available' && tool.path) {
    router.push(tool.path)
  }
}

const tabs = [
  { name: 'all', label: '全部' },
  { name: 'time', label: '时间工具' },
  { name: 'codec', label: '编码工具' },
  { name: 'json', label: 'JSON工具' },
  { name: 'image', label: '图片工具' },
  { name: 'diff', label: '文本比较' }
]
</script>

<template>
  <AppLayout>
    <div class="h-full flex flex-col">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">百宝箱</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">实用工具集合</p>
      </div>

      <!-- Content -->
      <div class="flex-1 p-6 overflow-auto bg-gray-50 dark:bg-gray-900">
        <n-tabs v-model:value="currentTab" type="line" animated>
          <n-tab-pane
            v-for="tab in tabs"
            :key="tab.name"
            :name="tab.name"
            :tab="tab.label"
          >
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
              <ToolCard
                v-for="tool in filteredTools"
                :key="tool.id"
                :name="tool.name"
                :description="tool.description"
                :icon="tool.icon"
                :status="tool.status"
                @click="navigateToTool(tool)"
              />
            </div>
          </n-tab-pane>
        </n-tabs>
      </div>
    </div>
  </AppLayout>
</template>
