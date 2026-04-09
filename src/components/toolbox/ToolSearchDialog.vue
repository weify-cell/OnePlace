<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { TOOLS, CATEGORIES, type ToolConfig } from '@/components/toolbox/tools.config'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const router = useRouter()
const searchQuery = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement>()

const searchResults = computed(() => {
  if (!searchQuery.value.trim()) {
    return TOOLS
  }

  const query = searchQuery.value.toLowerCase()
  return TOOLS.filter(tool =>
    tool.name.toLowerCase().includes(query) ||
    tool.description.toLowerCase().includes(query) ||
    tool.id.toLowerCase().includes(query)
  )
})

const groupedResults = computed(() => {
  const groups: Record<string, ToolConfig[]> = {}

  for (const tool of searchResults.value) {
    if (!groups[tool.category]) {
      groups[tool.category] = []
    }
    groups[tool.category].push(tool)
  }

  return groups
})

const flatResults = computed(() => searchResults.value)

function getCategoryName(categoryId: string): string {
  const cat = CATEGORIES.find(c => c.id === categoryId)
  return cat ? `${cat.icon} ${cat.name}` : categoryId
}

function close() {
  emit('update:visible', false)
  searchQuery.value = ''
  selectedIndex.value = 0
}

function selectTool(tool: ToolConfig) {
  if (tool.status === 'available' && tool.routePath) {
    router.push(tool.routePath)
    close()
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, flatResults.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const tool = flatResults.value[selectedIndex.value]
    if (tool) selectTool(tool)
  } else if (e.key === 'Escape') {
    close()
  }
}

watch(() => props.visible, (val) => {
  if (val) {
    setTimeout(() => inputRef.value?.focus(), 100)
  }
})

watch(searchQuery, () => {
  selectedIndex.value = 0
})

function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    emit('update:visible', true)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <n-modal
    :show="visible"
    preset="card"
    class="search-dialog"
    :style="{ maxWidth: '560px', width: '90vw' }"
    :mask-closable="true"
    @update:show="emit('update:visible', $event)"
  >
    <template #header>
      <div class="search-input-wrapper">
        <span class="search-icon">🔍</span>
        <input
          ref="inputRef"
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="搜索工具..."
          @keydown="handleKeydown"
        />
        <kbd class="search-hint">ESC</kbd>
      </div>
    </template>

    <div class="search-results">
      <div v-if="flatResults.length === 0" class="search-empty">
        <span>没有找到匹配的工具</span>
      </div>

      <div v-for="(tools, categoryId) in groupedResults" :key="categoryId" class="search-group">
        <div class="search-group-title">{{ getCategoryName(categoryId) }}</div>
        <div
          v-for="(tool, idx) in tools"
          :key="tool.id"
          class="search-item"
          :class="{
            'is-selected': flatResults.indexOf(tool) === selectedIndex,
            'is-disabled': tool.status === 'coming-soon'
          }"
          @click="selectTool(tool)"
          @mouseenter="selectedIndex = flatResults.indexOf(tool)"
        >
          <span class="search-item-icon">{{ tool.icon }}</span>
          <div class="search-item-content">
            <span class="search-item-name">{{ tool.name }}</span>
            <span class="search-item-desc">{{ tool.description }}</span>
          </div>
          <n-tag v-if="tool.status === 'coming-soon'" size="small" type="default">即将推出</n-tag>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="search-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> 导航</span>
        <span><kbd>↵</kbd> 打开</span>
        <span><kbd>ESC</kbd> 关闭</span>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.search-input-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-md);
}

.search-icon {
  font-size: 1rem;
  opacity: 0.6;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 0.9375rem;
  outline: none;
  color: var(--text-primary);
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-hint {
  padding: 2px 7px;
  font-size: 0.6875rem;
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: 4px;
  color: var(--text-muted);
  font-family: inherit;
}

.search-results {
  max-height: 400px;
  overflow-y: auto;
  margin: -8px;
  padding: 8px;
}

.search-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.875rem;
}

.search-group {
  margin-bottom: 8px;
}

.search-group-title {
  padding: 8px 12px 4px;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.search-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.12s ease;
}

.search-item:hover,
.search-item.is-selected {
  background: rgba(245, 158, 11, 0.08);
}

.search-item.is-selected {
  border-left: 2px solid var(--accent-primary);
}

.search-item.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.search-item-icon {
  font-size: 1.5rem;
  line-height: 1;
  flex-shrink: 0;
}

.search-item-content {
  flex: 1;
  min-width: 0;
}

.search-item-name {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.search-item-desc {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-footer {
  display: flex;
  gap: 16px;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.search-footer kbd {
  padding: 2px 5px;
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: 3px;
  font-size: 0.6875rem;
  margin-right: 4px;
  font-family: inherit;
}
</style>
