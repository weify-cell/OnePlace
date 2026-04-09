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
  <div class="message-input-bar">
    <div class="message-input-bar__inner">
      <!-- Input container -->
      <div class="message-input-box" :class="{ 'message-input-box--disabled': chatStore.isStreaming }">
        <n-input
          v-model:value="content"
          type="textarea"
          placeholder="输入消息，Enter 发送，Shift+Enter 换行..."
          :autosize="{ minRows: 1, maxRows: 6 }"
          :disabled="chatStore.isStreaming"
          class="message-input-box__input"
          @keydown="handleKeydown"
        />

        <!-- Action bar -->
        <div class="message-input-box__actions">
          <span class="message-input-box__hint">
            <template v-if="!chatStore.isStreaming">⏎ 发送  ·  ⇧ 换行</template>
            <template v-else>
              <span class="message-input-box__thinking">AI 正在思考...</span>
            </template>
          </span>

          <div class="message-input-box__btns">
            <!-- Stop button -->
            <n-button
              v-if="chatStore.isStreaming"
              size="small"
              type="warning"
              quaternary
              class="message-input-box__stop-btn"
              @click="chatStore.cancelStream()"
            >
              <template #icon>
                <span>⏹</span>
              </template>
              停止
            </n-button>

            <!-- Send button -->
            <n-button
              v-else
              size="small"
              type="primary"
              class="message-input-box__send-btn"
              :disabled="!content.trim()"
              @click="handleSend"
            >
              <template #icon>
                <span>→</span>
              </template>
              发送
            </n-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Hint text -->
    <p class="message-input-bar__footer">
      AI 助手可能会产生不准确的信息，请谨慎采纳
    </p>
  </div>
</template>

<style scoped>
.message-input-bar {
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-card);
  padding: 12px 24px 16px;
  flex-shrink: 0;
}

.message-input-bar__inner {
  max-width: 4xl;
  margin: 0 auto;
}

.message-input-box {
  background: var(--bg-primary);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-lg);
  transition: all 0.2s ease;
}

.message-input-box:focus-within {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
}

.message-input-box--disabled {
  opacity: 0.7;
}

:deep(.message-input-box__input .n-input__input-el) {
  border: none;
  background: transparent;
}

:deep(.message-input-box__input .n-input-wrapper) {
  border: none;
  background: transparent;
  padding: 12px 14px 0;
}

:deep(.message-input-box__input) {
  font-family: inherit;
}

.message-input-box__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 10px;
  gap: 12px;
}

.message-input-box__hint {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.message-input-box__thinking {
  color: var(--accent-primary);
  font-weight: 500;
}

.message-input-box__btns {
  display: flex;
  align-items: center;
  gap: 8px;
}

.message-input-box__send-btn {
  background: var(--accent-gradient) !important;
  border: none !important;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
  font-weight: 600;
}

.message-input-box__send-btn:hover {
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
}

.message-input-box__stop-btn {
  color: var(--warning);
}

.message-input-bar__footer {
  max-width: 4xl;
  margin: 10px auto 0;
  text-align: center;
  font-size: 0.6875rem;
  color: var(--text-muted);
}
</style>
