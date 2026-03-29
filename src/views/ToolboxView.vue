<script setup lang="ts">
import { useRouter } from 'vue-router'
import AppLayout from '@/components/common/AppLayout.vue'
import ToolCard from '@/components/toolbox/ToolCard.vue'

const router = useRouter()

interface Tool {
  id: string
  name: string
  description: string
  icon: string
  path: string
}

const devTools: Tool[] = [
  {
    id: 'json',
    name: 'JSON 格式化',
    description: '格式化、压缩、验证、转义',
    icon: '📝',
    path: '/toolbox/json'
  },
  {
    id: 'image-base64',
    name: '图片 Base64',
    description: '图片与 Base64 互转',
    icon: '🖼️',
    path: '/toolbox/image-base64'
  }
]

function navigateToTool(path: string) {
  router.push(path)
}
</script>

<template>
  <AppLayout>
    <div class="h-full flex flex-col">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">百宝箱</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">实用开发工具集合</p>
      </div>

      <!-- Content -->
      <div class="flex-1 p-6 overflow-auto bg-gray-50 dark:bg-gray-900">
        <n-tabs type="line" animated>
          <!-- 开发工具 -->
          <n-tab-pane name="dev" tab="开发工具">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
              <ToolCard
                v-for="tool in devTools"
                :key="tool.id"
                :name="tool.name"
                :description="tool.description"
                :icon="tool.icon"
                @click="navigateToTool(tool.path)"
              />
            </div>
          </n-tab-pane>

          <!-- 时间工具 -->
          <n-tab-pane name="time" tab="时间工具">
            <div class="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
              <span class="text-6xl mb-4">⏰</span>
              <p class="text-lg">即将推出</p>
              <p class="text-sm mt-2">时间戳转换、日期计算等功能正在开发中</p>
            </div>
          </n-tab-pane>

          <!-- 编解码工具 -->
          <n-tab-pane name="codec" tab="编解码工具">
            <div class="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
              <span class="text-6xl mb-4">🔐</span>
              <p class="text-lg">即将推出</p>
              <p class="text-sm mt-2">URL 编解码、Base64、哈希计算等功能正在开发中</p>
            </div>
          </n-tab-pane>
        </n-tabs>
      </div>
    </div>
  </AppLayout>
</template>
