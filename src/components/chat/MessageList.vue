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
  <div
    ref="listEl"
    class="message-list"
  >
    <MessageBubble v-for="msg in chatStore.messages" :key="msg.id" :message="msg" />

    <!-- Streaming message with typing animation -->
    <div v-if="chatStore.isStreaming && chatStore.streamingMessage" class="message-list__streaming animate-fadeIn">
      <div class="message-list__streaming-inner">
        <div class="message-list__avatar">AI</div>
        <div class="message-list__bubble">
          <span>{{ chatStore.streamingMessage }}</span>
          <span class="message-list__cursor" />
        </div>
      </div>
    </div>

    <!-- Thinking indicator -->
    <div v-else-if="chatStore.isStreaming" class="message-list__thinking animate-fadeIn">
      <div class="message-list__thinking-inner">
        <div class="message-list__avatar">AI</div>
        <div class="message-list__bubble message-list__bubble--thinking">
          <div class="message-list__dots">
            <span class="message-list__dot" style="--delay: 0ms" />
            <span class="message-list__dot" style="--delay: 150ms" />
            <span class="message-list__dot" style="--delay: 300ms" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-list {
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

/* Streaming bubble wrapper */
.message-list__streaming,
.message-list__thinking {
  display: flex;
  justify-content: flex-start;
}

.message-list__streaming-inner,
.message-list__thinking-inner {
  display: flex;
  gap: 10px;
  max-width: 85%;
}

.message-list__avatar {
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

.message-list__bubble {
  padding: 10px 14px;
  border-radius: 16px;
  border-top-left-radius: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 0.875rem;
  line-height: 1.5;
}

.message-list__cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--accent-primary);
  border-radius: 1px;
  margin-left: 2px;
  animation: blink 1s infinite;
  vertical-align: text-bottom;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* Thinking dots */
.message-list__bubble--thinking {
  padding: 12px 16px;
}

.message-list__dots {
  display: flex;
  align-items: center;
  gap: 5px;
}

.message-list__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-primary);
  animation: bounce 1.2s infinite ease-in-out;
  animation-delay: var(--delay);
}

@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-5px); opacity: 1; }
}

/* Fade in animation */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-out forwards;
}
</style>
