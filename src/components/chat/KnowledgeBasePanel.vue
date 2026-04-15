<script setup lang="ts">
import { ref, computed } from 'vue'
import { knowledgeBaseApi, type KnowledgeBaseSettings } from '@/api/knowledge-base.api'
import { useMessage } from 'naive-ui'

const props = defineProps<{
  conversationId: number
  kbEnabled: boolean
}>()

const emit = defineEmits<{
  'update:kbEnabled': [value: boolean]
}>()

const message = useMessage()
const settings = ref<Partial<KnowledgeBaseSettings>>({})
const loading = ref(false)
const statsLoading = ref(false)
const saving = ref(false)
const rebuilding = ref(false)
const stats = ref({ points_count: 0 })
const panelVisible = ref(false)

const localKbEnabled = computed({
  get: () => props.kbEnabled,
  set: (v) => emit('update:kbEnabled', v)
})

async function loadSettings() {
  loading.value = true
  try {
    const res = await knowledgeBaseApi.getSettings()
    settings.value = res.data.data
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  statsLoading.value = true
  try {
    const res = await knowledgeBaseApi.getStats()
    stats.value = res.data.data
  } finally {
    statsLoading.value = false
  }
}

async function saveSettings() {
  saving.value = true
  try {
    await knowledgeBaseApi.updateSettings(settings.value)
    message.success('知识库设置已保存')
  } catch (e) {
    message.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function rebuildIndex() {
  rebuilding.value = true
  try {
    await knowledgeBaseApi.rebuild()
    message.success('索引重建已启动')
  } catch (e) {
    message.error('重建失败')
  } finally {
    rebuilding.value = false
  }
}

function toggle() {
  panelVisible.value = !panelVisible.value
  if (panelVisible.value) {
    loadSettings()
    loadStats()
  }
}

defineExpose({ toggle })
</script>

<template>
  <div class="kb-panel">
    <div class="kb-panel__header">
      <span class="kb-panel__title">📚 知识库设置</span>
    </div>

    <div class="kb-panel__body">
      <!-- 启用开关 -->
      <div class="kb-panel__row">
        <span>启用知识库</span>
        <n-switch v-model:value="localKbEnabled" />
      </div>

      <!-- 检索范围 (全部笔记) -->

      <!-- Top K -->
      <div class="kb-panel__row">
        <span>Top K: {{ settings.kb_top_k ?? 5 }}</span>
        <n-slider
          v-model:value="settings.kb_top_k ?? 5"
          :min="1"
          :max="20"
          :step="1"
          style="width: 120px"
        />
      </div>

      <!-- 重建索引按钮 -->
      <div class="kb-panel__actions">
        <n-button size="small" :loading="statsLoading" @click="loadStats">
          刷新统计
        </n-button>
        <n-button size="small" type="warning" :loading="rebuilding" @click="rebuildIndex">
          重建索引
        </n-button>
        <n-button size="small" type="primary" :loading="saving" @click="saveSettings">
          保存
        </n-button>
      </div>

      <!-- 统计信息 -->
      <div class="kb-panel__stats">
        已索引：{{ stats.points_count }} 个段落
      </div>
    </div>
  </div>
</template>

<style scoped>
.kb-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 12px 16px;
  min-width: 280px;
}

.kb-panel__header {
  margin-bottom: 12px;
}

.kb-panel__title {
  font-weight: 600;
  font-size: 0.875rem;
}

.kb-panel__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.kb-panel__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.8125rem;
  gap: 12px;
}

.kb-panel__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.kb-panel__stats {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-align: right;
}
</style>
