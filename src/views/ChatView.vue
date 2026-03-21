<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat.store'
import AppLayout from '@/components/common/AppLayout.vue'
import ConversationList from '@/components/chat/ConversationList.vue'
import MessageList from '@/components/chat/MessageList.vue'
import MessageInput from '@/components/chat/MessageInput.vue'
import EmptyState from '@/components/common/EmptyState.vue'

const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()

onMounted(async () => {
  await chatStore.fetchConversations()
  const id = route.params.id
  if (id) {
    const conv = chatStore.conversations.find(c => c.id === Number(id))
    if (conv) await chatStore.selectConversation(conv)
  }
})

async function newConversation() {
  const conv = await chatStore.createConversation()
  await chatStore.selectConversation(conv)
  router.push(`/chat/${conv.id}`)
}

watch(() => route.params.id, async (id) => {
  if (id) {
    const conv = chatStore.conversations.find(c => c.id === Number(id))
    if (conv) await chatStore.selectConversation(conv)
  }
})
</script>

<template>
  <AppLayout>
    <div class="h-full flex">
      <!-- Sidebar: conversation list -->
      <div class="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div class="p-3 border-b border-gray-200 dark:border-gray-700">
          <n-button type="primary" block size="small" @click="newConversation">+ 新对话</n-button>
        </div>
        <ConversationList />
      </div>

      <!-- Main: messages -->
      <div class="flex-1 flex flex-col min-w-0">
        <template v-if="chatStore.currentConversation">
          <!-- Header -->
          <div class="flex-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <h2 class="font-medium text-gray-900 dark:text-white truncate">
              {{ chatStore.currentConversation.title }}
            </h2>
            <span class="text-xs text-gray-400 flex-shrink-0">
              {{ chatStore.currentConversation.provider }} / {{ chatStore.currentConversation.model }}
            </span>
          </div>
          <MessageList class="flex-1" />
          <MessageInput />
        </template>
        <div v-else class="flex-1 flex-center">
          <EmptyState
            title="选择或创建对话"
            description="从左侧选择一个对话，或点击「新对话」开始"
            action-label="新建对话"
            @action="newConversation"
          />
        </div>
      </div>
    </div>
  </AppLayout>
</template>
