<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat.store'

const router = useRouter()
const chatStore = useChatStore()
const dialog = useDialog()

function selectConv(conv: typeof chatStore.conversations[0]) {
  chatStore.selectConversation(conv)
  router.push(`/chat/${conv.id}`)
}

function confirmDelete(conv: typeof chatStore.conversations[0], e: Event) {
  e.stopPropagation()
  dialog.warning({
    title: '删除对话',
    content: `确定删除「${conv.title}」？`,
    positiveText: '删除',
    onPositiveClick: () => chatStore.deleteConversation(conv.id)
  })
}
</script>

<template>
  <div class="flex-1 overflow-y-auto py-2">
    <div
      v-for="conv in chatStore.conversations"
      :key="conv.id"
      :class="[
        'flex-between px-3 py-2.5 mx-2 rounded-lg cursor-pointer group',
        chatStore.currentConversation?.id === conv.id
          ? 'bg-primary-50 dark:bg-primary-900'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
      ]"
      @click="selectConv(conv)"
    >
      <span class="text-sm truncate text-gray-700 dark:text-gray-300">{{ conv.title }}</span>
      <n-button
        size="tiny"
        quaternary
        class="opacity-0 group-hover:opacity-100 flex-shrink-0"
        @click="confirmDelete(conv, $event)"
      >✕</n-button>
    </div>
    <div v-if="chatStore.conversations.length === 0" class="text-center text-gray-400 text-sm py-4">
      暂无对话
    </div>
  </div>
</template>
