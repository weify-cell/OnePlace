<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Message, ToolCallRecord } from '@/types'
import MarkdownIt from 'markdown-it'

const props = defineProps<{ message: Message; liveThinking?: string; liveToolCalls?: Array<{ id: string; name: string; arguments: Record<string, any>; status: string; result?: string }> }>()

const md = new MarkdownIt({ html: false, linkify: true, typographer: true })

const renderedContent = computed(() => {
  if (props.message.role === 'assistant') {
    return md.render(props.message.content)
  }
  return props.message.content
})

const isUser = computed(() => props.message.role === 'user')

const citationsExpanded = ref(false)
const toolCallsExpanded = ref(false)

const citations = computed(() => {
  if (!props.message.kb_citations) return []
  if (Array.isArray(props.message.kb_citations)) return props.message.kb_citations
  try {
    return JSON.parse(props.message.kb_citations as unknown as string)
  } catch {
    return []
  }
})

const toolCalls = computed<ToolCallRecord[]>(() => {
  if (!props.message.tool_calls) return []
  if (Array.isArray(props.message.tool_calls)) return props.message.tool_calls
  try {
    return JSON.parse(props.message.tool_calls as unknown as string)
  } catch {
    return []
  }
})

const hasLiveActivity = computed(() => {
  return (props.liveThinking && props.liveThinking.length > 0) || (props.liveToolCalls && props.liveToolCalls.length > 0)
})

function truncate(text: string, maxLen = 120) {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '...'
}

function formatArgs(args: Record<string, any>): string {
  try {
    return JSON.stringify(args)
  } catch {
    return String(args)
  }
}
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

        <!-- KB Citations collapsible -->
        <div v-if="citations.length > 0" class="message-bubble__citations">
          <button class="citations-toggle" @click="citationsExpanded = !citationsExpanded">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="citations-toggle__icon" :class="citationsExpanded && 'citations-toggle__icon--open'">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            引用文档 ({{ citations.length }})
          </button>
          <div v-if="citationsExpanded" class="citations-list">
            <div v-for="(cite, i) in citations" :key="cite.note_id" class="citation-item">
              <div class="citation-item__header">
                <span class="citation-item__index">[{{ i + 1 }}]</span>
                <span class="citation-item__title">{{ cite.title }}</span>
                <span class="citation-item__score">{{ (cite.score * 100).toFixed(0) }}分</span>
              </div>
              <p class="citation-item__content">{{ truncate(cite.content) }}</p>
            </div>
          </div>
        </div>

        <!-- Tool Calls collapsible (persisted) -->
        <div v-if="toolCalls.length > 0" class="message-bubble__tools">
          <button class="citations-toggle" @click="toolCallsExpanded = !toolCallsExpanded">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="citations-toggle__icon" :class="toolCallsExpanded && 'citations-toggle__icon--open'">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
            工具调用 ({{ toolCalls.length }})
          </button>
          <div v-if="toolCallsExpanded" class="citations-list">
            <div v-for="tc in toolCalls" :key="tc.id" class="tool-item">
              <div class="tool-item__header">
                <span class="tool-item__icon">🔧</span>
                <span class="tool-item__name">{{ tc.name }}</span>
                <span v-if="tc.isError" class="tool-item__error">失败</span>
                <span v-else class="tool-item__success">✓</span>
              </div>
              <p class="tool-item__args">{{ formatArgs(tc.arguments) }}</p>
              <p v-if="tc.result" class="tool-item__result">{{ truncate(tc.result) }}</p>
            </div>
          </div>
        </div>

        <!-- Live activity (streaming) -->
        <div v-if="hasLiveActivity" class="message-bubble__live">
          <div v-if="liveThinking" class="live-thinking">
            <span class="live-label">💭 思考中...</span>
            <p class="live-thinking__text">{{ liveThinking }}</p>
          </div>
          <div v-if="liveToolCalls && liveToolCalls.length > 0" class="live-tools">
            <div v-for="tc in liveToolCalls" :key="tc.id" class="live-tool">
              <span class="live-label">
                {{ tc.status === 'running' ? '⏳' : '✓' }} {{ tc.name }}
              </span>
              <span v-if="tc.status === 'running'" class="live-tool__running">执行中...</span>
            </div>
          </div>
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

/* KB Citations */
.message-bubble__citations {
  margin-top: 10px;
  border-top: 1px dashed var(--border-subtle);
  padding-top: 8px;
}

.citations-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--text-muted);
  padding: 2px 0;
  font-weight: 600;
}

.citations-toggle:hover {
  color: var(--accent-primary);
}

.citations-toggle__icon {
  width: 14px;
  height: 14px;
  transition: transform 0.2s;
}

.citations-toggle__icon--open {
  transform: rotate(90deg);
}

.citations-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.citation-item {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 8px 10px;
}

.citation-item__header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.citation-item__index {
  font-size: 0.6875rem;
  font-weight: 700;
  color: var(--accent-primary);
}

.citation-item__title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary);
  flex: 1;
}

.citation-item__score {
  font-size: 0.6875rem;
  color: var(--text-muted);
  background: var(--bg-primary);
  padding: 1px 6px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
}

.citation-item__content {
  font-size: 0.6875rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Tool Calls */
.message-bubble__tools {
  margin-top: 10px;
  border-top: 1px dashed var(--border-subtle);
  padding-top: 8px;
}

.tool-item {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 8px 10px;
}

.tool-item__header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.tool-item__icon {
  font-size: 0.75rem;
}

.tool-item__name {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary);
  font-family: monospace;
  flex: 1;
}

.tool-item__success {
  font-size: 0.6875rem;
  color: #16a34a;
  font-weight: 600;
}

.tool-item__error {
  font-size: 0.6875rem;
  color: #dc2626;
  font-weight: 600;
}

.tool-item__args {
  font-size: 0.6875rem;
  color: var(--text-muted);
  font-family: monospace;
  margin: 2px 0;
  word-break: break-all;
}

.tool-item__result {
  font-size: 0.6875rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 4px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Live activity (streaming) */
.message-bubble__live {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-subtle);
}

.live-thinking {
  margin-bottom: 6px;
}

.live-label {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-muted);
}

.live-thinking__text {
  font-size: 0.6875rem;
  color: var(--text-secondary);
  margin: 2px 0 0;
  font-style: italic;
  white-space: pre-wrap;
}

.live-tool {
  display: flex;
  align-items: center;
  gap: 6px;
}

.live-tool__running {
  font-size: 0.6875rem;
  color: var(--accent-primary);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
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
