<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '@/stores/chat.store'

const chatStore = useChatStore()
const content = ref('')

async function handleSend() {
  if (!content.value.trim() || chatStore.isStreaming) return
  const text = content.value.trim()
  content.value = ''
  await chatStore.sendMessage(text)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}
</script>

<template>
  <div class="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
    <div class="flex gap-2 items-end">
      <n-input
        v-model:value="content"
        type="textarea"
        placeholder="输入消息，Enter 发送，Shift+Enter 换行..."
        :autosize="{ minRows: 1, maxRows: 6 }"
        :disabled="chatStore.isStreaming"
        class="flex-1"
        @keydown="handleKeydown"
      />
      <div class="flex flex-col gap-1">
        <n-button
          v-if="chatStore.isStreaming"
          type="error"
          size="medium"
          @click="chatStore.cancelStream()"
        >
          ⏹ 停止
        </n-button>
        <n-button
          v-else
          type="primary"
          size="medium"
          :disabled="!content.trim()"
          @click="handleSend"
        >
          发送
        </n-button>
      </div>
    </div>
  </div>
</template>
