<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat.store'
import AppLayout from '@/components/common/AppLayout.vue'
import ConversationList from '@/components/chat/ConversationList.vue'
import MessageList from '@/components/chat/MessageList.vue'
import MessageInput from '@/components/chat/MessageInput.vue'
import KnowledgeBasePanel from '@/components/chat/KnowledgeBasePanel.vue'

const route = useRoute()
const router = useRouter()
const chatStore = useChatStore()
const message = useMessage()

const kbPanelVisible = ref(false)

function toggleKbPanel() {
  kbPanelVisible.value = !kbPanelVisible.value
}

async function onKbEnabledChange(enabled: boolean) {
  if (!chatStore.currentConversation) return
  const { chatApi } = await import('@/api/chat.api')
  try {
    await chatApi.updateConversation(chatStore.currentConversation.id, {
      kb_enabled: enabled
    })
    await chatStore.fetchConversations()
    const conv = chatStore.conversations.find(c => c.id === chatStore.currentConversation?.id)
    if (conv) chatStore.currentConversation = conv
  } catch (e: any) {
    console.error('[ChatView] onKbEnabledChange error:', e?.response?.data || e?.message || e)
  }
}

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
    <div class="chat-page">
      <!-- Sidebar -->
      <div class="chat-sidebar">
        <!-- Header -->
        <div class="chat-sidebar__header">
          <n-button
            type="primary"
            block
            class="chat-sidebar__new-btn"
            @click="newConversation"
          >
            <template #icon>
              <span>✨</span>
            </template>
            新对话
          </n-button>
        </div>

        <!-- Conversation list -->
        <ConversationList />
      </div>

      <!-- Main content -->
      <div class="chat-main">
        <template v-if="chatStore.currentConversation">
          <!-- Chat header -->
          <div class="chat-header">
            <div class="chat-header__inner">
              <div class="chat-header__meta">
                <!-- Model badge -->
                <div class="chat-header__badge">
                  <span class="chat-header__badge-icon">🤖</span>
                  <span class="chat-header__badge-text">
                    {{ chatStore.currentConversation.model }}
                  </span>
                </div>
                <span class="chat-header__provider">
                  {{ chatStore.currentConversation.provider }}
                </span>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <div
                      class="chat-header__kb-btn"
                      :class="{ 'chat-header__kb-btn--active': kbPanelVisible }"
                      @click="toggleKbPanel"
                    >
                      <span>📚</span>
                    </div>
                  </template>
                  {{ chatStore.currentConversation?.kb_enabled ? '知识库：已启用' : '知识库：已关闭' }}
                </n-tooltip>
              </div>

              <!-- Title -->
              <h2 class="chat-header__title">
                {{ chatStore.currentConversation.title }}
              </h2>
            </div>

            <!-- KB Panel -->
            <div v-if="kbPanelVisible && chatStore.currentConversation" class="chat-header__kb-panel">
              <KnowledgeBasePanel
                :conversation-id="chatStore.currentConversation.id"
                :kb-enabled="!!chatStore.currentConversation.kb_enabled"
                @update:kb-enabled="onKbEnabledChange"
              />
            </div>
          </div>

          <!-- Messages area -->
          <MessageList class="chat-main__messages" />

          <!-- Input area -->
          <MessageInput />
        </template>

        <!-- Empty state -->
        <div v-else class="chat-empty">
          <div class="chat-empty__content">
            <div class="chat-empty__icon">💭</div>
            <h3 class="chat-empty__title">开始新对话</h3>
            <p class="chat-empty__desc">与 AI 助手展开对话，探索无限可能</p>
            <n-button
              type="primary"
              size="large"
              class="chat-empty__btn"
              @click="newConversation"
            >
              <template #icon>
                <span>✨</span>
              </template>
              创建对话
            </n-button>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.chat-page {
  height: 100%;
  display: flex;
  background: var(--bg-primary);
}

/* Sidebar */
.chat-sidebar {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-subtle);
}

.chat-sidebar__header {
  padding: 16px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.chat-sidebar__new-btn {
  background: var(--accent-gradient) !important;
  border: none !important;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);
  font-weight: 600;
  transition: all 0.2s ease;
}

.chat-sidebar__new-btn:hover {
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
  transform: translateY(-1px);
}

/* Main */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.chat-main__messages {
  flex: 1;
}

/* Header */
.chat-header {
  position: relative;
  padding: 14px 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-card);
  flex-shrink: 0;
}

.chat-header__inner {
  max-width: 4xl;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.chat-header__meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chat-header__badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
}

.chat-header__badge-icon {
  font-size: 0.875rem;
}

.chat-header__badge-text {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--accent-primary);
}

.chat-header__provider {
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.chat-header__title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Empty state */
.chat-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-content-gradient);
}

.chat-empty__content {
  text-align: center;
  padding: 24px;
}

.chat-empty__icon {
  font-size: 4rem;
  margin-bottom: 16px;
}

.chat-empty__title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.chat-empty__desc {
  font-size: 0.875rem;
  color: var(--text-muted);
  margin-bottom: 24px;
}

.chat-empty__btn {
  background: var(--accent-gradient) !important;
  border: none !important;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);
  font-weight: 600;
  transition: all 0.2s ease;
}

.chat-empty__btn:hover {
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
  transform: translateY(-1px);
}

.chat-header__kb-btn {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-md);
  font-size: 1rem;
  transition: background 0.2s;
}

.chat-header__kb-btn:hover {
  background: rgba(245, 158, 11, 0.1);
}

.chat-header__kb-btn--active {
  background: rgba(245, 158, 11, 0.15);
}

.chat-header__kb-panel {
  position: absolute;
  top: 100%;
  right: 24px;
  z-index: 100;
  margin-top: 8px;
  box-shadow: var(--shadow-lg);
  border-radius: var(--radius-lg);
}
</style>
