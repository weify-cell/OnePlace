<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '@/components/common/AppLayout.vue'
import ToolCard from '@/components/toolbox/ToolCard.vue'
import ToolSearchDialog from '@/components/toolbox/ToolSearchDialog.vue'
import { TOOLS, CATEGORIES, type ToolConfig } from '@/components/toolbox/tools.config'

const router = useRouter()
const showSearch = ref(false)

const PINS = ['json', 'timestamp', 'text-diff', 'image-base64']

const pinnedTools = computed(() => {
  return PINS.map(id => TOOLS.find(t => t.id === id)).filter(Boolean) as ToolConfig[]
})

const expandedCategories = ref<string[]>(['dev', 'text', 'image'])

function toggleCategory(categoryId: string) {
  const index = expandedCategories.value.indexOf(categoryId)
  if (index >= 0) {
    expandedCategories.value.splice(index, 1)
  } else {
    expandedCategories.value.push(categoryId)
  }
}

function getToolsByCategory(categoryId: string): ToolConfig[] {
  return TOOLS.filter(tool => tool.category === categoryId)
}

function navigateToTool(tool: ToolConfig) {
  if (tool.status === 'available' && tool.routePath) {
    router.push(tool.routePath)
  }
}
</script>

<template>
  <AppLayout>
    <div class="h-full flex flex-col">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">🧰 百宝箱</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">实用工具集合</p>
          </div>
          <n-button quaternary circle @click="showSearch = true">
            <template #icon>
              <span>🔍</span>
            </template>
          </n-button>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 p-6 overflow-auto bg-gray-50 dark:bg-gray-900">
        <!-- 快捷入口 -->
        <section class="mb-8">
          <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">快捷入口</h2>
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <ToolCard
              v-for="tool in pinnedTools"
              :key="tool.id"
              :name="tool.name"
              :description="tool.description"
              :icon="tool.icon"
              :status="tool.status"
              @click="navigateToTool(tool)"
            />
          </div>
        </section>

        <!-- 工具面板 -->
        <section>
          <h2 class="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">所有工具</h2>
          <div class="space-y-2">
            <div
              v-for="category in CATEGORIES"
              :key="category.id"
              class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <!-- Category Header -->
              <div
                class="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                @click="toggleCategory(category.id)"
              >
                <div class="flex items-center gap-2">
                  <span>{{ category.icon }}</span>
                  <span class="font-medium text-gray-900 dark:text-white">{{ category.name }}</span>
                  <n-tag size="small" type="default">{{ getToolsByCategory(category.id).length }}</n-tag>
                </div>
                <span class="text-gray-400 transition-transform" :class="{ 'rotate-180': expandedCategories.includes(category.id) }">
                  ▼
                </span>
              </div>

              <!-- Category Tools -->
              <div
                class="category-content border-t border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-200 ease-out"
                :class="expandedCategories.includes(category.id) ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'"
              >
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                  <ToolCard
                    v-for="tool in getToolsByCategory(category.id)"
                    :key="tool.id"
                    :name="tool.name"
                    :description="tool.description"
                    :icon="tool.icon"
                    :status="tool.status"
                    @click="navigateToTool(tool)"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- 搜索对话框 -->
    <ToolSearchDialog v-model:visible="showSearch" />
  </AppLayout>
</template>
