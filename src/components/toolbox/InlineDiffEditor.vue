<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import type { DiffLine } from '@/utils/text-diff'

const props = defineProps<{
  modelValue: string
  diffLines: DiffLine[]
  side: 'left' | 'right'
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const containerRef = ref<HTMLDivElement>()

// 是否处于比较模式（diffLines 有内容表示正在显示差异）
const isComparing = computed(() => props.diffLines && props.diffLines.length > 0)

// 渲染高亮内容（用于比较模式）
const highlightedHtml = computed(() => {
  if (!isComparing.value) return ''

  return props.diffLines.map((line, idx) => {
    // 空白行或无字符差异时
    if (!line.chars || line.chars.length === 0) {
      // 空白行用 <br> 渲染
      return '<br>'
    }

    // 使用字符级差异渲染
    let html = line.chars.map(ch => {
      const escaped = escapeHtml(ch.content)
      if (ch.type === 'delete') {
        return `<span class="diff-delete">${escaped}</span>`
      } else if (ch.type === 'insert') {
        return `<span class="diff-insert">${escaped}</span>`
      } else {
        return `<span class="diff-equal">${escaped}</span>`
      }
    }).join('')

    // 如果行内容以换行符结尾（不是最后一行），添加 <br>
    if (line.content.endsWith('\n') && idx < props.diffLines.length - 1) {
      html += '<br>'
    }

    return html
  }).join('')
})

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// 处理输入（ contenteditable 的 div 输入时触发）
function onInput(e: Event) {
  const target = e.target as HTMLDivElement
  emit('update:modelValue', target.innerText)
}

// 处理粘贴：只保留纯文本
function onPaste(e: ClipboardEvent) {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain') || ''
  document.execCommand('insertText', false, text)
}

// 同步外部 modelValue 变化到 div
watch(() => props.modelValue, () => {
  nextTick(() => {
    if (containerRef.value && !isComparing.value) {
      const currentText = containerRef.value.innerText
      if (currentText !== props.modelValue) {
        containerRef.value.innerText = props.modelValue
      }
    }
  })
})

// 进入比较模式时，同步内容
watch(isComparing, (comparing) => {
  if (comparing && containerRef.value) {
    // 切换到比较模式，用 HTML 显示差异
    containerRef.value.innerHTML = highlightedHtml.value
  } else if (!comparing && containerRef.value) {
    // 切换回输入模式，恢复纯文本
    containerRef.value.innerText = props.modelValue
  }
})

// 组件挂载时初始化内容
onMounted(() => {
  nextTick(() => {
    if (containerRef.value && !isComparing.value && props.modelValue) {
      containerRef.value.innerText = props.modelValue
    }
  })
})
</script>

<template>
  <div class="diff-container">
    <div
      ref="containerRef"
      class="diff-editor"
      :class="{ 'is-comparing': isComparing }"
      :contenteditable="!isComparing ? 'true' : 'false'"
      :data-placeholder="placeholder"
      spellcheck="false"
      @input="onInput"
      @paste="onPaste"
    />
  </div>
</template>

<style scoped>
.diff-container {
  position: relative;
  width: 100%;
  height: 100%;
}

.diff-editor {
  width: 100%;
  height: 100%;
  padding: 12px;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 14px;
  line-height: 1.6;
  color: var(--n-text-color);
  background: var(--n-color);
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-y: auto;
  outline: none;
  transition: border-color 0.2s;
}

.diff-editor:focus {
  border-color: var(--n-primary-color);
}

/* 输入模式占位符 */
.diff-editor:empty::before {
  content: attr(data-placeholder);
  color: var(--n-text-color-3);
  pointer-events: none;
}

/* 比较模式样式 */
.diff-editor.is-comparing {
  border-color: transparent;
  background: var(--n-color);
  cursor: default;
}

.diff-editor.is-comparing:focus {
  border-color: transparent;
}

/* 差异高亮 */
.diff-editor :deep(.diff-delete) {
  background-color: #fee2e2;
  color: #991b1b;
  border-radius: 2px;
  padding: 0 2px;
}

.diff-editor :deep(.diff-insert) {
  background-color: #dcfce7;
  color: #166534;
  border-radius: 2px;
  padding: 0 2px;
}

.diff-editor :deep(.diff-equal) {
  color: inherit;
}
</style>
