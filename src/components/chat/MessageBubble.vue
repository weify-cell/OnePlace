<script setup lang="ts">
import { computed } from 'vue'
import type { Message } from '@/types'
import MarkdownIt from 'markdown-it'

const props = defineProps<{ message: Message }>()

const md = new MarkdownIt({ html: false, linkify: true, typographer: true })

const renderedContent = computed(() => {
  if (props.message.role === 'assistant') {
    return md.render(props.message.content)
  }
  return props.message.content
})

const isUser = computed(() => props.message.role === 'user')
</script>

<template>
  <div :class="['message-bubble', isUser ? 'message-bubble--user' : 'message-bubble--ai', 'animate-fadeIn']">
    <!-- AI Message -->
    <div v-if="!isUser" class="message-bubble__ai-inner">
      <!-- AI Avatar -->
      <div class="message-bubble__avatar">AI</div>
      <!-- Bubble -->
      <div
        :class="[
          'message-bubble__text',
          message.is_error
            ? 'message-bubble__text--error'
            : 'message-bubble__text--ai'
        ]"
      >
        <div
          class="message-bubble__content prose prose-sm max-w-none dark:prose-invert"
          v-html="renderedContent"
        />
        <div v-if="message.tokens_used" class="message-bubble__tokens">
          {{ message.tokens_used }} tokens
        </div>
      </div>
    </div>

    <!-- User Message -->
    <div v-else class="message-bubble__user-inner">
      <div class="message-bubble__user-bubble">
        <p class="message-bubble__user-text">{{ message.content }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-out forwards;
}

/* AI message */
.message-bubble {
  display: flex;
}

.message-bubble--ai {
  justify-content: flex-start;
}

.message-bubble--user {
  justify-content: flex-end;
}

.message-bubble__ai-inner {
  display: flex;
  gap: 10px;
  max-width: 85%;
}

.message-bubble__avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent-gradient);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 0.75rem;
  font-weight: 700;
  box-shadow: var(--shadow-sm);
}

.message-bubble__text {
  padding: 10px 14px;
  border-radius: 16px;
  border-top-left-radius: 4px;
  box-shadow: var(--shadow-sm);
}

.message-bubble__text--ai {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.message-bubble__text--error {
  background: rgba(220, 38, 38, 0.06);
  border: 1px solid rgba(220, 38, 38, 0.2);
  color: #dc2626;
}

.dark .message-bubble__text--error {
  background: rgba(248, 113, 113, 0.1);
  color: #f87171;
}

.message-bubble__content {
  font-size: 0.875rem;
  line-height: 1.6;
}

.message-bubble__content :deep(p) {
  margin: 0;
}

.message-bubble__tokens {
  margin-top: 8px;
  font-size: 0.6875rem;
  color: var(--text-muted);
}

/* User message */
.message-bubble__user-inner {
  max-width: 75%;
}

.message-bubble__user-bubble {
  background: var(--accent-gradient);
  color: white;
  border-radius: 16px;
  border-top-right-radius: 4px;
  padding: 10px 14px;
  box-shadow: var(--shadow-sm);
}

.message-bubble__user-text {
  font-size: 0.875rem;
  line-height: 1.5;
  white-space: pre-wrap;
  margin: 0;
}
</style>
