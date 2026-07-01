<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings.store'
import { useKnowledgeBaseStore } from '@/stores/knowledge_base.store'
import SettingsLayout from './SettingsLayout.vue'

const settingsStore = useSettingsStore()
const kbStore = useKnowledgeBaseStore()
const message = useMessage()
const saving = ref(false)
const rebuilding = ref(false)

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
  rebuilding.value = true
  try {
    await kbStore.rebuildIndex()
    message.success('索引重建已启动')
  } finally {
    rebuilding.value = false
  }
}

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
            <n-button @click="rebuildIndex" :loading="rebuilding">
              重建索引
            </n-button>
          </div>
        </div>
      </div>
    </div>
  </SettingsLayout>
</template>

<style scoped src="./settings.css"></style>
