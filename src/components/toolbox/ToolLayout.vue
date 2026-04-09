<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

defineProps<{
  title: string
  status?: string
}>()

const router = useRouter()

function goBack() {
  router.push('/toolbox')
}

// Ctrl+Enter / Cmd+Enter shortcut
function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    window.dispatchEvent(new CustomEvent('tool-layout:execute'))
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-4 bg-white dark:bg-gray-800">
      <n-button quaternary circle @click="goBack">
        <template #icon>
          <span>←</span>
        </template>
      </n-button>
      <div class="flex-1">
        <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <router-link to="/toolbox" class="hover:text-primary">百宝箱</router-link>
          <span>/</span>
          <span class="text-gray-900 dark:text-white">{{ title }}</span>
        </div>
      </div>
      <slot name="header" />
    </div>

    <!-- Toolbar -->
    <div v-if="$slots.toolbar" class="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-2 bg-white dark:bg-gray-800">
      <slot name="toolbar" />
    </div>

    <!-- Content -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Input -->
      <div class="flex-1 flex flex-col border-r border-gray-200 dark:border-gray-700">
        <div class="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <slot name="input-header">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">输入</span>
          </slot>
        </div>
        <div class="flex-1 p-2 overflow-auto">
          <slot name="input" />
        </div>
      </div>

      <!-- Output -->
      <div class="flex-1 flex flex-col">
        <div class="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <slot name="output-header">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">输出</span>
          </slot>
          <slot name="output-actions" />
        </div>
        <div class="flex-1 p-2 overflow-auto">
          <slot name="output" />
        </div>
      </div>
    </div>

    <!-- Status Bar -->
    <div class="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
      <slot name="status">
        <span v-if="status">{{ status }}</span>
        <span v-else>按 ⌘+Enter 执行操作</span>
      </slot>
    </div>
  </div>
</template>
