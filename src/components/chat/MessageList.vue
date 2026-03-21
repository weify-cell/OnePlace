<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { useChatStore } from '@/stores/chat.store'
import MessageBubble from './MessageBubble.vue'

const chatStore = useChatStore()
const listEl = ref<HTMLElement | null>(null)

function scrollToBottom() {
  nextTick(() => {
    if (listEl.value) {
      listEl.value.scrollTop = listEl.value.scrollHeight
    }
  })
}

watch(() => [chatStore.messages.length, chatStore.streamingMessage], scrollToBottom, { flush: 'post' })

onMounted(scrollToBottom)
</script>

<template>
  <div ref="listEl" class="overflow-y-auto p-4 space-y-4">
    <MessageBubble v-for="msg in chatStore.messages" :key="msg.id" :message="msg" />

    <!-- Streaming message -->
    <div v-if="chatStore.isStreaming && chatStore.streamingMessage" class="flex justify-start">
      <div class="max-w-3xl rounded-2xl px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100">
        <span class="whitespace-pre-wrap">{{ chatStore.streamingMessage }}</span>
        <span class="inline-block w-1.5 h-4 bg-current animate-pulse ml-1 align-middle" />
      </div>
    </div>

    <!-- Thinking indicator -->
    <div v-else-if="chatStore.isStreaming" class="flex justify-start">
      <div class="rounded-2xl px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-400 text-sm">
        思考中...
      </div>
    </div>
  </div>
</template>
