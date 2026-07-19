<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '@/stores/settings.store'
import { useKnowledgeBaseStore } from '@/stores/knowledge_base.store'
import type { KnowledgeBaseRebuildStatus, KnowledgeBaseRebuildNoteStatus } from '@/stores/knowledge_base.store'
import SettingsLayout from './SettingsLayout.vue'

const settingsStore = useSettingsStore()
const kbStore = useKnowledgeBaseStore()
const message = useMessage()
const saving = ref(false)
const startingRebuild = ref(false)
let rebuildPollTimer: ReturnType<typeof setInterval> | null = null
let notifyRebuildCompletion = false

const kbConfig = ref({
  qdrant_url: 'http://localhost:6333',
  qdrant_collection: 'notes_knowledge_base',
  kb_chunk_size: 500,
  kb_chunk_overlap: 50,
  embedding_provider: 'qwen',
  embedding_model: 'text-embedding-v4',
  embedding_api_key: '',
  embedding_base_url: '',
  rerank_provider: 'qwen',
  rerank_model: 'qwen3-rerank',
  rerank_api_key: '',
  rerank_base_url: '',
  kb_top_k: 20,
  kb_rerank_recall_size: 5,
  kb_score_threshold: 0
})

onMounted(async () => {
  await settingsStore.loadSettings()
  await kbStore.loadConfig()
  await kbStore.fetchRebuildStatus()
  kbConfig.value = {
    qdrant_url: kbStore.config.qdrant_url || 'http://localhost:6333',
    qdrant_collection: kbStore.config.qdrant_collection || 'notes_knowledge_base',
    kb_chunk_size: kbStore.config.kb_chunk_size || 500,
    kb_chunk_overlap: kbStore.config.kb_chunk_overlap || 50,
    embedding_provider: kbStore.config.embedding_provider || 'qwen',
    embedding_model: kbStore.config.embedding_model || 'text-embedding-v4',
    embedding_api_key: kbStore.config.embedding_api_key || '',
    embedding_base_url: kbStore.config.embedding_base_url || '',
    rerank_provider: kbStore.config.rerank_provider || 'qwen',
    rerank_model: kbStore.config.rerank_model || 'qwen3-rerank',
    rerank_api_key: kbStore.config.rerank_api_key || '',
    rerank_base_url: kbStore.config.rerank_base_url || '',
    kb_top_k: kbStore.config.kb_top_k || 20,
    kb_rerank_recall_size: kbStore.config.kb_rerank_recall_size || 5,
    kb_score_threshold: kbStore.config.kb_score_threshold ?? 0
  }
  if (kbStore.rebuildStatus.running) {
    startRebuildStatusPolling()
  }
})

const embeddingProviderOptions = [
  { label: '通义千问 (Qwen)', value: 'qwen' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'Jina AI', value: 'jina' },
  { label: 'Cohere', value: 'cohere' },
  { label: '自定义', value: 'custom' }
]

const embeddingModelOptions = computed(() => {
  const models: Record<string, { label: string; value: string }[]> = {
    qwen: [{ label: 'text-embedding-v4', value: 'text-embedding-v4' }],
    openai: [{ label: 'text-embedding-3-small', value: 'text-embedding-3-small' }, { label: 'text-embedding-3-large', value: 'text-embedding-3-large' }],
    jina: [{ label: 'jina-embeddings-v3', value: 'jina-embeddings-v3' }],
    cohere: [{ label: 'embed-v3', value: 'embed-v3' }],
    custom: [{ label: '自定义模型', value: 'custom' }]
  }
  return models[kbConfig.value.embedding_provider] || models.qwen
})

const rerankProviderOptions = [
  { label: '通义千问 (Qwen)', value: 'qwen' },
  { label: 'Cohere', value: 'cohere' },
  { label: 'Jina AI', value: 'jina' },
  { label: '自定义', value: 'custom' }
]

const rerankModelOptions = computed(() => {
  const models: Record<string, { label: string; value: string }[]> = {
    qwen: [{ label: 'qwen3-rerank', value: 'qwen3-rerank' }],
    cohere: [{ label: 'cohere-rerank-v3', value: 'cohere-rerank-v3' }],
    jina: [{ label: 'jina-reranker-v2-base', value: 'jina-reranker-v2-base' }],
    custom: [{ label: '自定义模型', value: 'custom' }]
  }
  return models[kbConfig.value.rerank_provider] || models.qwen
})

const rebuildStatus = computed(() => kbStore.rebuildStatus)
const isRebuildRunning = computed(() => startingRebuild.value || kbStore.isRebuilding || rebuildStatus.value.running)
const showRebuildStatus = computed(() => rebuildStatus.value.phase !== 'idle' || !!rebuildStatus.value.startedAt)
const rebuildPhaseText = computed(() => {
  const labels: Record<KnowledgeBaseRebuildStatus['phase'], string> = {
    idle: '未开始',
    preparing: '准备中',
    embedding: '索引中',
    completed: '已完成',
    failed: '失败'
  }
  return labels[rebuildStatus.value.phase]
})
const rebuildProgressStatus = computed(() => {
  if (rebuildStatus.value.phase === 'failed') return 'error'
  if (rebuildStatus.value.phase === 'completed') return 'success'
  return undefined
})
const rebuildProgress = computed(() => {
  const status = rebuildStatus.value
  if (status.phase === 'completed') return 100
  if (status.totalNotes <= 0) return 0

  const activeNoteProgress = status.running && status.currentNoteId !== null && status.currentChunkTotal > 0
    ? Math.min(status.currentChunk / status.currentChunkTotal, 0.99)
    : 0
  const processedNotes = Math.min(status.completedNotes + activeNoteProgress, status.totalNotes)
  return Math.round((processedNotes / status.totalNotes) * 100)
})
const rebuildChunkText = computed(() => {
  const status = rebuildStatus.value
  return status.currentChunkTotal > 0 ? `${status.currentChunk}/${status.currentChunkTotal}` : '-'
})
const rebuildDetailText = computed(() => {
  const status = rebuildStatus.value

  if (status.running && status.phase === 'preparing') return '正在扫描已加入知识库的笔记'
  if (status.running && status.currentNoteTitle) return `正在索引：${status.currentNoteTitle}`
  if (status.running) return '正在索引知识库笔记'
  if (status.phase === 'completed' && status.totalNotes === 0) return '没有找到已加入知识库的笔记'
  if (status.phase === 'completed') return `已完成 ${status.completedNotes} 条笔记`
  if (status.phase === 'failed') return `索引结束，成功 ${status.completedNotes} 条，失败 ${status.failedNotes} 条`
  return ''
})
const rebuildTimingText = computed(() => {
  const status = rebuildStatus.value
  if (status.running && status.startedAt) return `开始于 ${formatDateTime(status.startedAt)}`
  if (status.finishedAt) return `结束于 ${formatDateTime(status.finishedAt)}`
  return ''
})

const rebuildNotes = computed(() => rebuildStatus.value.noteStatuses)

function getNoteProgress(note: KnowledgeBaseRebuildNoteStatus): number {
  if (note.phase === 'completed') return 100
  if (note.totalChunks <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((note.currentChunk / note.totalChunks) * 100)))
}

function getNoteProgressStatus(note: KnowledgeBaseRebuildNoteStatus): 'success' | 'error' | undefined {
  if (note.phase === 'completed') return 'success'
  if (note.phase === 'failed') return 'error'
  return undefined
}

function getNotePhaseText(note: KnowledgeBaseRebuildNoteStatus): string {
  const labels: Record<KnowledgeBaseRebuildNoteStatus['phase'], string> = {
    pending: '等待中',
    running: '建立索引中',
    completed: '已完成',
    failed: '失败'
  }
  return labels[note.phase]
}

function getNoteChunkText(note: KnowledgeBaseRebuildNoteStatus): string {
  return note.totalChunks > 0 ? `${note.currentChunk}/${note.totalChunks}` : '-'
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

async function saveAll() {
  saving.value = true
  try {
    const aiConfig: Record<string, { apiKey?: string; baseURL?: string }> = {}
    for (const [name, cfg] of Object.entries(providers.value)) {
      if (cfg.apiKey || cfg.baseURL) {
        aiConfig[name] = { apiKey: cfg.apiKey || undefined, baseURL: cfg.baseURL || undefined }
      }
    }
    if (kbConfig.value.embedding_api_key || kbConfig.value.embedding_base_url) {
      aiConfig[kbConfig.value.embedding_provider] = {
        apiKey: kbConfig.value.embedding_api_key || undefined,
        baseURL: kbConfig.value.embedding_base_url || undefined
      }
    }
    if (kbConfig.value.rerank_api_key || kbConfig.value.rerank_base_url) {
      aiConfig[kbConfig.value.rerank_provider] = {
        apiKey: kbConfig.value.rerank_api_key || undefined,
        baseURL: kbConfig.value.rerank_base_url || undefined
      }
    }
    await settingsStore.saveSetting('ai_providers', aiConfig)
    await settingsStore.saveSetting('qdrant_url', kbConfig.value.qdrant_url)
    await settingsStore.saveSetting('qdrant_collection', kbConfig.value.qdrant_collection)
    await settingsStore.saveSetting('kb_chunk_size', kbConfig.value.kb_chunk_size)
    await settingsStore.saveSetting('kb_chunk_overlap', kbConfig.value.kb_chunk_overlap)
    await settingsStore.saveSetting('embedding_provider', kbConfig.value.embedding_provider)
    await settingsStore.saveSetting('embedding_model', kbConfig.value.embedding_model)
    await settingsStore.saveSetting('kb_rerank_provider', kbConfig.value.rerank_provider)
    await settingsStore.saveSetting('kb_rerank_model', kbConfig.value.rerank_model)
    await settingsStore.saveSetting('kb_top_k', kbConfig.value.kb_top_k)
    await settingsStore.saveSetting('kb_rerank_recall_size', kbConfig.value.kb_rerank_recall_size)
    await settingsStore.saveSetting('kb_score_threshold', kbConfig.value.kb_score_threshold)
    message.success('设置已保存')
  } finally {
    saving.value = false
  }
}

async function rebuildIndex() {
  startingRebuild.value = true
  try {
    const result = await kbStore.rebuildIndex()
    notifyRebuildCompletion = true
    if (kbStore.rebuildStatus.running) {
      startRebuildStatusPolling()
      message.success(result?.message === 'Rebuild already running' ? '索引重建正在运行' : '索引重建已启动')
    } else {
      handleTerminalRebuildStatus(kbStore.rebuildStatus)
    }
  } catch (err: any) {
    message.error('索引重建启动失败: ' + (err.message || '未知错误'))
  } finally {
    startingRebuild.value = false
  }
}

function startRebuildStatusPolling() {
  if (rebuildPollTimer) return
  rebuildPollTimer = setInterval(async () => {
    try {
      const status = await kbStore.fetchRebuildStatus()
      if (!status.running) {
        stopRebuildStatusPolling()
        handleTerminalRebuildStatus(status)
      }
    } catch (err: any) {
      stopRebuildStatusPolling()
      if (notifyRebuildCompletion) {
        message.error('获取索引进度失败: ' + (err.message || '未知错误'))
        notifyRebuildCompletion = false
      }
    }
  }, 1500)
}

function stopRebuildStatusPolling() {
  if (!rebuildPollTimer) return
  clearInterval(rebuildPollTimer)
  rebuildPollTimer = null
}

function handleTerminalRebuildStatus(status: KnowledgeBaseRebuildStatus) {
  if (!notifyRebuildCompletion) return
  if (status.phase === 'completed') {
    message.success('索引重建已完成')
  } else if (status.phase === 'failed') {
    message.error(status.lastError ? `索引重建失败: ${status.lastError}` : '索引重建失败')
  }
  notifyRebuildCompletion = false
}

onUnmounted(() => {
  stopRebuildStatusPolling()
})

// 引用 settings 中的 providers（通用配置中的 AI providers）
const providers = ref<Record<string, { apiKey: string; baseURL: string }>>({})
</script>

<template>
  <SettingsLayout title="知识库配置" :saving="saving" @save="saveAll">
    <div class="settings-section animate-slideIn" style="animation-delay: 50ms">
      <div class="settings-card">
        <div class="settings-card__header">
          <div class="settings-card__icon">📚</div>
          <div>
            <h2 class="settings-card__title">知识库配置</h2>
            <p class="settings-card__desc">配置向量数据库、Embedding 和 Rerank 模型</p>
          </div>
        </div>
        <div class="settings-card__body">
          <div class="settings-field">
            <label class="settings-field__label">Qdrant 地址</label>
            <n-input v-model:value="kbConfig.qdrant_url" placeholder="http://localhost:6333" />
          </div>

          <div class="settings-field">
            <label class="settings-field__label">集合名称</label>
            <n-input v-model:value="kbConfig.qdrant_collection" placeholder="notes_knowledge_base" />
          </div>

          <div class="settings-row">
            <div class="settings-field">
              <label class="settings-field__label">Chunk 大小 (tokens)</label>
              <n-input-number v-model:value="kbConfig.kb_chunk_size" :min="100" :max="2000" />
            </div>
            <div class="settings-field">
              <label class="settings-field__label">Chunk 重叠 (tokens)</label>
              <n-input-number v-model:value="kbConfig.kb_chunk_overlap" :min="0" :max="500" />
            </div>
          </div>

          <div class="settings-kb-subheader">Embedding 配置</div>
          <div class="settings-row">
            <div class="settings-field">
              <label class="settings-field__label">Provider</label>
              <n-select v-model:value="kbConfig.embedding_provider" :options="embeddingProviderOptions" />
            </div>
            <div class="settings-field">
              <label class="settings-field__label">模型</label>
              <n-select v-model:value="kbConfig.embedding_model" :options="embeddingModelOptions" />
            </div>
          </div>
          <div class="settings-field">
            <label class="settings-field__label">API Key</label>
            <n-input v-model:value="kbConfig.embedding_api_key" type="password" show-password-on="click" placeholder="API Key" />
          </div>

          <div class="settings-kb-subheader">Rerank 配置</div>
          <div class="settings-row">
            <div class="settings-field">
              <label class="settings-field__label">Provider</label>
              <n-select v-model:value="kbConfig.rerank_provider" :options="rerankProviderOptions" />
            </div>
            <div class="settings-field">
              <label class="settings-field__label">模型</label>
              <n-select v-model:value="kbConfig.rerank_model" :options="rerankModelOptions" />
            </div>
          </div>
          <div class="settings-field">
            <label class="settings-field__label">API Key</label>
            <n-input v-model:value="kbConfig.rerank_api_key" type="password" show-password-on="click" placeholder="API Key" />
          </div>

          <div class="settings-kb-subheader">检索参数</div>
          <div class="settings-row">
            <div class="settings-field">
              <label class="settings-field__label">向量搜索数 (TopK)</label>
              <n-input-number v-model:value="kbConfig.kb_top_k" :min="5" :max="100" />
            </div>
            <div class="settings-field">
              <label class="settings-field__label">最终返回数 (TopN)</label>
              <n-input-number v-model:value="kbConfig.kb_rerank_recall_size" :min="1" :max="20" />
            </div>
          </div>
          <div class="settings-row">
            <div class="settings-field">
              <label class="settings-field__label">精排分数阈值</label>
              <n-input-number v-model:value="kbConfig.kb_score_threshold" :min="0" :max="1" :step="0.05" placeholder="0=不过滤" />
              <div class="settings-field__hint">低于此分数的引用会被过滤，0 表示不过滤</div>
            </div>
          </div>

          <div class="settings-field">
            <div class="kb-rebuild-actions">
              <n-button @click="rebuildIndex" :loading="isRebuildRunning">
                重建索引
              </n-button>
              <span v-if="showRebuildStatus" class="kb-rebuild-actions__status">{{ rebuildPhaseText }}</span>
            </div>
          </div>

          <div v-if="showRebuildStatus" class="kb-rebuild-status">
            <div class="kb-rebuild-status__header">
              <div class="kb-rebuild-status__title">
                <span :class="['status-dot', rebuildStatus.running ? 'status-dot--waiting' : rebuildStatus.phase === 'failed' ? 'status-dot--error' : 'status-dot--success']" />
                <span>{{ rebuildPhaseText }}</span>
              </div>
              <span class="kb-rebuild-status__percent">{{ rebuildProgress }}%</span>
            </div>
            <n-progress
              type="line"
              :percentage="rebuildProgress"
              :status="rebuildProgressStatus"
              :show-indicator="false"
            />
            <div class="kb-rebuild-status__meta">
              <div class="kb-rebuild-status__meta-item">
                <span>笔记</span>
                <strong>{{ rebuildStatus.completedNotes }}/{{ rebuildStatus.totalNotes }}</strong>
              </div>
              <div class="kb-rebuild-status__meta-item">
                <span>失败</span>
                <strong>{{ rebuildStatus.failedNotes }}</strong>
              </div>
              <div class="kb-rebuild-status__meta-item">
                <span>Chunk</span>
                <strong>{{ rebuildChunkText }}</strong>
              </div>
            </div>
            <div v-if="rebuildDetailText" class="kb-rebuild-status__detail">{{ rebuildDetailText }}</div>
            <div v-if="rebuildStatus.lastError" class="status-error">{{ rebuildStatus.lastError }}</div>
            <div v-if="rebuildTimingText" class="settings-field__hint">{{ rebuildTimingText }}</div>
            <div v-if="rebuildNotes.length > 0" class="kb-note-progress-list">
              <div
                v-for="note in rebuildNotes"
                :key="note.noteId"
                class="kb-note-progress-item"
              >
                <div class="kb-note-progress-item__header">
                  <div class="kb-note-progress-item__title">
                    <span
                      :class="[
                        'status-dot',
                        note.phase === 'running'
                          ? 'status-dot--waiting'
                          : note.phase === 'failed'
                            ? 'status-dot--error'
                            : note.phase === 'completed'
                              ? 'status-dot--success'
                              : 'status-dot--stopped'
                      ]"
                    />
                    <span class="kb-note-progress-item__name">{{ note.noteTitle }}</span>
                  </div>
                  <div class="kb-note-progress-item__summary">
                    <span>{{ getNotePhaseText(note) }}</span>
                    <span>{{ getNoteProgress(note) }}%</span>
                  </div>
                </div>
                <n-progress
                  type="line"
                  :percentage="getNoteProgress(note)"
                  :status="getNoteProgressStatus(note)"
                  :show-indicator="false"
                />
                <div class="kb-note-progress-item__meta">
                  <span>Chunk {{ getNoteChunkText(note) }}</span>
                  <span>ID {{ note.noteId }}</span>
                </div>
                <div v-if="note.error" class="status-error">{{ note.error }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </SettingsLayout>
</template>

<style scoped src="./settings.css"></style>
