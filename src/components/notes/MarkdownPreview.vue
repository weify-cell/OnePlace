<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'

const props = defineProps<{
  content: string
}>()

marked.setOptions({ async: false, breaks: true })

const renderedHtml = computed(() => {
  if (!props.content) return ''
  try {
    return marked.parse(props.content) as string
  } catch {
    return '<p>渲染错误</p>'
  }
})
</script>

<template>
  <div class="markdown-preview" v-html="renderedHtml" />
</template>

<style scoped>
.markdown-preview {
  padding: 20px 24px;
  font-size: 0.9375rem;
  line-height: 1.75;
  color: var(--text-primary);
}

.markdown-preview :deep(h1) {
  font-size: 1.5rem;
  font-weight: 800;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.markdown-preview :deep(h2) {
  font-size: 1.25rem;
  font-weight: 700;
  margin-top: 1.75rem;
  margin-bottom: 0.75rem;
  color: var(--text-primary);
}

.markdown-preview :deep(h3) {
  font-size: 1.125rem;
  font-weight: 600;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.markdown-preview :deep(h4),
.markdown-preview :deep(h5),
.markdown-preview :deep(h6) {
  font-weight: 600;
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.markdown-preview :deep(p) {
  margin-bottom: 1rem;
  line-height: 1.75;
  color: var(--text-secondary);
}

.markdown-preview :deep(ul),
.markdown-preview :deep(ol) {
  padding-left: 1.5rem;
  margin-bottom: 1rem;
  color: var(--text-secondary);
}

.markdown-preview :deep(li) {
  margin-bottom: 0.35rem;
}

.markdown-preview :deep(blockquote) {
  border-left: 3px solid var(--accent-primary);
  padding-left: 1rem;
  color: var(--text-muted);
  margin: 1.25rem 0;
  font-style: italic;
  background: rgba(245, 158, 11, 0.04);
  padding: 8px 16px;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.markdown-preview :deep(code) {
  background: var(--bg-secondary);
  color: var(--accent-secondary);
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-size: 0.875em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.markdown-preview :deep(pre) {
  background: #1e2533;
  color: #e2e8f0;
  padding: 1rem;
  border-radius: var(--radius-md);
  overflow-x: auto;
  margin: 1.25rem 0;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.dark .markdown-preview :deep(pre) {
  background: #0f172a;
}

.markdown-preview :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
  font-size: 0.875rem;
}

.markdown-preview :deep(img) {
  max-width: 100%;
  border-radius: var(--radius-md);
  margin: 0.75rem 0;
}

.markdown-preview :deep(hr) {
  border: none;
  border-top: 1px solid var(--border-subtle);
  margin: 2rem 0;
}

.markdown-preview :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 1.25rem 0;
  font-size: 0.875rem;
}

.markdown-preview :deep(th),
.markdown-preview :deep(td) {
  border: 1px solid var(--border-subtle);
  padding: 0.5rem 0.75rem;
  text-align: left;
}

.markdown-preview :deep(th) {
  background: var(--bg-secondary);
  font-weight: 700;
  color: var(--text-primary);
}

.markdown-preview :deep(tr:nth-child(even)) {
  background: rgba(0, 0, 0, 0.02);
}

.dark .markdown-preview :deep(tr:nth-child(even)) {
  background: rgba(255, 255, 255, 0.02);
}

.markdown-preview :deep(a) {
  color: var(--accent-primary);
  text-decoration: underline;
  text-decoration-color: rgba(245, 158, 11, 0.4);
  text-underline-offset: 2px;
  transition: text-decoration-color 0.15s ease;
}

.markdown-preview :deep(a:hover) {
  text-decoration-color: var(--accent-primary);
}

.markdown-preview :deep(strong) {
  font-weight: 700;
  color: var(--text-primary);
}

.markdown-preview :deep(em) {
  color: var(--text-secondary);
}
</style>
