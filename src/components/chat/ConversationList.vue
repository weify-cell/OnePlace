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

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="conv-list">
    <!-- Section label -->
    <div class="conv-list__header">
      <span class="conv-list__label">历史对话</span>
    </div>

    <!-- Conversation items -->
    <div
      v-for="conv in chatStore.conversations"
      :key="conv.id"
      :class="[
        'conv-item',
        chatStore.currentConversation?.id === conv.id && 'conv-item--active'
      ]"
      @click="selectConv(conv)"
    >
      <div class="conv-item__icon">💬</div>

      <!-- Content -->
      <div class="conv-item__content">
        <div class="conv-item__row">
          <span class="conv-item__title">{{ conv.title }}</span>
          <span class="conv-item__time">{{ formatTime(conv.updated_at) }}</span>
        </div>
        <div class="conv-item__meta">
          {{ conv.provider }} · {{ conv.model }}
        </div>
      </div>

      <!-- Delete button -->
      <n-button
        size="tiny"
        quaternary
        class="conv-item__delete"
        @click="confirmDelete(conv, $event)"
      >
        <template #icon>
          <span class="text-xs">✕</span>
        </template>
      </n-button>
    </div>

    <!-- Empty state -->
    <div v-if="chatStore.conversations.length === 0" class="conv-list__empty">
      <div class="conv-list__empty-icon">💭</div>
      <div class="conv-list__empty-text">暂无对话记录</div>
    </div>
  </div>
</template>

<style scoped>
.conv-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.conv-list__header {
  padding: 4px 16px 8px;
}

.conv-list__label {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* Conversation item */
.conv-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  margin: 0 8px 2px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease;
}

.conv-item:hover {
  background: var(--bg-card);
}

.conv-item:hover .conv-item__delete {
  opacity: 1;
}

.conv-item--active {
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-subtle);
}

.conv-item--active .conv-item__delete {
  opacity: 1;
}

.conv-item__icon {
  font-size: 1rem;
  flex-shrink: 0;
  margin-top: 1px;
}

.conv-item__content {
  flex: 1;
  min-width: 0;
}

.conv-item__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.conv-item__title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.conv-item--active .conv-item__title {
  color: var(--accent-primary);
}

.conv-item__time {
  font-size: 0.6875rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.conv-item__meta {
  font-size: 0.6875rem;
  color: var(--text-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-item__delete {
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
  margin-top: 1px;
}

/* Empty state */
.conv-list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 16px;
  gap: 8px;
}

.conv-list__empty-icon {
  font-size: 1.75rem;
}

.conv-list__empty-text {
  font-size: 0.8125rem;
  color: var(--text-muted);
}
</style>
