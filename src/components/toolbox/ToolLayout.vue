<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

defineProps<{
  title: string
  status?: string
}>()

const router = useRouter()

function goBack() {
  router.push('/toolbox')
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    window.dispatchEvent(new CustomEvent('tool-layout:execute'))
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="tool-layout">
    <!-- Header -->
    <div class="tool-layout__header">
      <n-button quaternary circle @click="goBack">
        <template #icon>
          <span>←</span>
        </template>
      </n-button>
      <div class="tool-layout__breadcrumb">
        <router-link to="/toolbox" class="tool-layout__breadcrumb-link">百宝箱</router-link>
        <span class="tool-layout__breadcrumb-sep">/</span>
        <span class="tool-layout__breadcrumb-current">{{ title }}</span>
      </div>
      <slot name="header" />
    </div>

    <!-- Toolbar -->
    <div v-if="$slots.toolbar" class="tool-layout__toolbar">
      <slot name="toolbar" />
    </div>

    <!-- Content -->
    <div class="tool-layout__content">
      <!-- Input -->
      <div class="tool-layout__pane tool-layout__pane--input">
        <div class="tool-layout__pane-header">
          <slot name="input-header">
            <span class="tool-layout__pane-title">输入</span>
          </slot>
        </div>
        <div class="tool-layout__pane-body">
          <slot name="input" />
        </div>
      </div>

      <!-- Output -->
      <div class="tool-layout__pane tool-layout__pane--output">
        <div class="tool-layout__pane-header">
          <slot name="output-header">
            <span class="tool-layout__pane-title">输出</span>
          </slot>
          <slot name="output-actions" />
        </div>
        <div class="tool-layout__pane-body">
          <slot name="output" />
        </div>
      </div>
    </div>

    <!-- Status Bar -->
    <div class="tool-layout__status">
      <slot name="status">
        <span v-if="status">{{ status }}</span>
        <span v-else>按 ⌘+Enter 执行操作</span>
      </slot>
    </div>
  </div>
</template>

<style scoped>
.tool-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

/* Header */
.tool-layout__header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-card);
  flex-shrink: 0;
}

.tool-layout__breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  font-size: 0.875rem;
}

.tool-layout__breadcrumb-link {
  color: var(--text-muted);
  text-decoration: none;
  transition: color 0.15s ease;
}

.tool-layout__breadcrumb-link:hover {
  color: var(--accent-primary);
}

.tool-layout__breadcrumb-sep {
  color: var(--text-muted);
}

.tool-layout__breadcrumb-current {
  color: var(--text-primary);
  font-weight: 600;
}

/* Toolbar */
.tool-layout__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 24px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-card);
  flex-shrink: 0;
}

/* Content */
.tool-layout__content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Panes */
.tool-layout__pane {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tool-layout__pane--input {
  border-right: 1px solid var(--border-subtle);
}

.tool-layout__pane-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.tool-layout__pane-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.tool-layout__pane-body {
  flex: 1;
  padding: 12px;
  overflow: auto;
}

/* Status bar */
.tool-layout__status {
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-subtle);
  font-size: 0.75rem;
  color: var(--text-muted);
  flex-shrink: 0;
}
</style>
