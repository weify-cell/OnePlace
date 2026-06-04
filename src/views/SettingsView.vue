<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useSettingsStore } from '@/stores/settings.store'
import { useKnowledgeBaseStore } from '@/stores/knowledge_base.store'
import { useILinkStore } from '@/stores/ilink.store'
import AppLayout from '@/components/common/AppLayout.vue'


const settingsStore = useSettingsStore()
const ilinkStore = useILinkStore()
const message = useMessage()
const saving = ref(false)
const rebuilding = ref(false)

// iLink config
const ilinkConfig = ref({
  provider: 'qwen',
  model: 'qwen-turbo',
  system_prompt: '你是一个智能助手，可以通过微信为用户提供服务。请用中文回复。',
  max_tool_rounds: 5
})

const ilinkProviderModels = computed(() => {
  const p = settingsStore.availableProviders.find(p => p.name === ilinkConfig.value.provider)
  return p?.models.map(m => ({ label: m.name, value: m.id })) || []
})

// Knowledge base config
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

// Local form state
const providers = ref<Record<string, { apiKey: string; baseURL: string }>>({})
const defaultProvider = ref('')
const defaultModel = ref('')
const theme = ref<'light' | 'dark' | 'system'>('system')

watch(theme, (val) => { settingsStore.theme = val })

onMounted(async () => {
  await settingsStore.loadSettings()
  // Initialize local form from store
  defaultProvider.value = settingsStore.defaultProvider
  defaultModel.value = settingsStore.defaultModel
  theme.value = settingsStore.theme
  // Initialize providers
  for (const p of settingsStore.availableProviders) {
    providers.value[p.name] = {
      apiKey: settingsStore.aiProviders[p.name]?.apiKey || '',
      baseURL: settingsStore.aiProviders[p.name]?.baseURL || ''
    }
  }
  // Load KB config
  const kbStore = useKnowledgeBaseStore()
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
    rerank_model: kbStore.config.rerank_model || 'bge-reranker-v2-m3',
    rerank_api_key: kbStore.config.rerank_api_key || '',
    rerank_base_url: kbStore.config.rerank_base_url || '',
    kb_top_k: kbStore.config.kb_top_k || 20,
    kb_rerank_recall_size: kbStore.config.kb_rerank_recall_size || 5,
    kb_score_threshold: kbStore.config.kb_score_threshold ?? 0
  }
  // Load iLink config
  await ilinkStore.fetchConfig()
  await ilinkStore.fetchStatus()
  if (ilinkStore.config) {
    ilinkConfig.value = {
      provider: ilinkStore.config.provider || 'qwen',
      model: ilinkStore.config.model || 'qwen-turbo',
      system_prompt: ilinkStore.config.system_prompt || '你是一个智能助手，可以通过微信为用户提供服务。请用中文回复。',
      max_tool_rounds: ilinkStore.config.max_tool_rounds || 5
    }
  }
})

const themeOptions = [
  { label: '跟随系统', value: 'system' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' }
]

const currentProviderModels = computed(() => {
  const p = settingsStore.availableProviders.find(p => p.name === defaultProvider.value)
  return p?.models.map(m => ({ label: m.name, value: m.id })) || []
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
    qwen: [
      { label: 'text-embedding-v4', value: 'text-embedding-v4' },
      { label: 'text-embedding-v3', value: 'text-embedding-v3' }
    ],
    openai: [
      { label: 'text-embedding-3-large', value: 'text-embedding-3-large' },
      { label: 'text-embedding-3-small', value: 'text-embedding-3-small' },
      { label: 'text-embedding-ada-002', value: 'text-embedding-ada-002' }
    ],
    jina: [
      { label: 'jina-embeddings-v3', value: 'jina-embeddings-v3' }
    ],
    cohere: [
      { label: 'embed-english-v3', value: 'embed-english-v3' },
      { label: 'embed-multilingual-v3', value: 'embed-multilingual-v3' }
    ],
    custom: [
      { label: '自定义模型', value: 'custom' }
    ]
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
    qwen: [
      { label: 'qwen3-rerank', value: 'qwen3-rerank' },
      { label: 'gte-reranker', value: 'gte-reranker' }
    ],
    cohere: [
      { label: 'cohere-rerank-v3', value: 'cohere-rerank-v3' },
      { label: 'cohere-rerank-v2', value: 'cohere-rerank-v2' }
    ],
    jina: [
      { label: 'jina-reranker-v2-base', value: 'jina-reranker-v2-base' }
    ],
    custom: [
      { label: '自定义模型', value: 'custom' }
    ]
  }
  return models[kbConfig.value.rerank_provider] || models.qwen
})

async function saveAll() {
  saving.value = true
  try {
    await settingsStore.saveSetting('theme', theme.value)
    await settingsStore.saveSetting('default_provider', defaultProvider.value)
    await settingsStore.saveSetting('default_model', defaultModel.value)
    // Build ai_providers config with embedding and rerank
    const aiConfig: Record<string, { apiKey?: string; baseURL?: string }> = {}
    for (const [name, cfg] of Object.entries(providers.value)) {
      if (cfg.apiKey || cfg.baseURL) {
        aiConfig[name] = { apiKey: cfg.apiKey || undefined, baseURL: cfg.baseURL || undefined }
      }
    }
    // Add embedding and rerank provider configs
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
    // Save KB config
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
  const kbStore = useKnowledgeBaseStore()
  rebuilding.value = true
  try {
    await kbStore.rebuildIndex()
    message.success('索引重建已启动')
  } finally {
    rebuilding.value = false
  }
}

// iLink Bot functions
async function saveILinkConfig() {
  try {
    await ilinkStore.updateConfig(ilinkConfig.value)
    message.success('Bot 配置已保存')
  } catch (err: any) {
    message.error('保存失败: ' + (err.message || '未知错误'))
  }
}

async function handleStartBot() {
  try {
    const result = await ilinkStore.startBot()
    if (result.success) {
      message.success('Bot 已启动，请查看控制台获取二维码')
      // 开始轮询状态
      startStatusPolling()
    } else {
      message.error('启动失败: ' + result.error)
    }
  } catch (err: any) {
    message.error('启动失败: ' + (err.message || '未知错误'))
  }
}

async function handleStopBot() {
  try {
    const result = await ilinkStore.stopBot()
    if (result.success) {
      message.success('Bot 已停止')
      stopStatusPolling()
    } else {
      message.error('停止失败: ' + result.error)
    }
  } catch (err: any) {
    message.error('停止失败: ' + (err.message || '未知错误'))
  }
}

async function handleResetLogin() {
  await ilinkStore.resetLogin()
  message.info('登录状态已重置')
}

// 状态轮询
let statusPollTimer: ReturnType<typeof setInterval> | null = null

function startStatusPolling() {
  if (statusPollTimer) {
    clearInterval(statusPollTimer)
  }
  statusPollTimer = setInterval(async () => {
    await ilinkStore.fetchStatus()
  }, 3000)
}

function stopStatusPolling() {
  if (statusPollTimer) {
    clearInterval(statusPollTimer)
    statusPollTimer = null
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}小时${minutes % 60}分钟`
  } else if (minutes > 0) {
    return `${minutes}分钟`
  } else {
    return `${seconds}秒`
  }
}

// 清理定时器
onUnmounted(() => {
  stopLoginPolling()
})
</script>

<template>
  <AppLayout>
    <div class="settings-page">
      <!-- Background -->
      <div class="settings-page__bg" />

      <div class="settings-content">
        <!-- Page header -->
        <div class="settings-header animate-slideIn">
          <h1 class="settings-header__title">设置</h1>
          <n-button
            type="primary"
            :loading="saving"
            class="settings-header__btn"
            @click="saveAll"
          >
            保存设置
          </n-button>
        </div>

        <!-- Theme section -->
        <div class="settings-section animate-slideIn" style="animation-delay: 50ms">
          <div class="settings-card">
            <div class="settings-card__header">
              <div class="settings-card__icon">🎨</div>
              <div>
                <h2 class="settings-card__title">外观</h2>
                <p class="settings-card__desc">自定义应用外观和主题</p>
              </div>
            </div>
            <div class="settings-card__body">
              <div class="settings-field">
                <label class="settings-field__label">主题</label>
                <div class="theme-options">
                  <button
                    v-for="opt in themeOptions"
                    :key="opt.value"
                    :class="['theme-option', theme === opt.value && 'theme-option--active']"
                    @click="theme = opt.value as 'light' | 'dark' | 'system'"
                  >
                    <span class="theme-option__icon">
                      {{ opt.value === 'system' ? '💻' : opt.value === 'light' ? '☀️' : '🌙' }}
                    </span>
                    <span class="theme-option__label">{{ opt.label }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- AI Provider section -->
        <div class="settings-section animate-slideIn" style="animation-delay: 100ms">
          <div class="settings-card">
            <div class="settings-card__header">
              <div class="settings-card__icon">🤖</div>
              <div>
                <h2 class="settings-card__title">AI 对话配置</h2>
                <p class="settings-card__desc">配置 AI 服务提供商和模型</p>
              </div>
            </div>
            <div class="settings-card__body">
              <!-- Provider + Model selection -->
              <div class="settings-row">
                <div class="settings-field">
                  <label class="settings-field__label">默认提供商</label>
                  <n-select
                    v-model:value="defaultProvider"
                    :options="settingsStore.availableProviders.map(p => ({ label: p.displayName, value: p.name }))"
                    placeholder="选择提供商"
                    @update:value="defaultModel = ''"
                  />
                </div>
                <div class="settings-field">
                  <label class="settings-field__label">默认模型</label>
                  <n-select
                    v-model:value="defaultModel"
                    :options="currentProviderModels"
                    :disabled="!defaultProvider"
                    placeholder="选择模型"
                  />
                </div>
              </div>

              <!-- Provider API configs (collapsible) -->
              <n-collapse class="settings-collapse">
                <n-collapse-item
                  v-for="p in settingsStore.availableProviders"
                  :key="p.name"
                  :title="`${p.displayName} API 配置`"
                  :name="p.name"
                >
                  <div class="settings-field">
                    <label class="settings-field__label">API Key</label>
                    <n-input
                      v-if="providers[p.name]"
                      v-model:value="providers[p.name].apiKey"
                      type="password"
                      show-password-on="click"
                      :placeholder="`${p.displayName} API Key`"
                    />
                  </div>
                  <div v-if="p.name === 'custom'" class="settings-field" style="margin-top: 12px;">
                    <label class="settings-field__label">Base URL</label>
                    <n-input
                      v-if="providers[p.name]"
                      v-model:value="providers[p.name].baseURL"
                      placeholder="https://..."
                    />
                  </div>
                </n-collapse-item>
              </n-collapse>
            </div>
          </div>
        </div>

        <!-- Knowledge Base section -->
        <div class="settings-section animate-slideIn" style="animation-delay: 150ms">
          <div class="settings-card">
            <div class="settings-card__header">
              <div class="settings-card__icon">📚</div>
              <div>
                <h2 class="settings-card__title">知识库配置</h2>
                <p class="settings-card__desc">配置向量数据库、Embedding 和 Rerank 模型</p>
              </div>
            </div>
            <div class="settings-card__body">
              <!-- Qdrant URL -->
              <div class="settings-field">
                <label class="settings-field__label">Qdrant 地址</label>
                <n-input v-model:value="kbConfig.qdrant_url" placeholder="http://localhost:6333" />
              </div>

              <!-- Qdrant Collection -->
              <div class="settings-field">
                <label class="settings-field__label">集合名称</label>
                <n-input v-model:value="kbConfig.qdrant_collection" placeholder="notes_knowledge_base" />
              </div>

              <!-- Chunk size and overlap -->
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

              <!-- Embedding 配置 -->
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

              <!-- Rerank 配置 -->
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

              <!-- Retrieval params -->
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

              <!-- Rebuild index button -->
              <div class="settings-field">
                <n-button @click="rebuildIndex" :loading="rebuilding">
                  重建索引
                </n-button>
              </div>
            </div>
          </div>
        </div>

        <!-- WeChat iLink Bot section -->
        <div class="settings-section animate-slideIn" style="animation-delay: 200ms">
          <div class="settings-card">
            <div class="settings-card__header">
              <div class="settings-card__icon">💬</div>
              <div>
                <h2 class="settings-card__title">微信 Bot</h2>
                <p class="settings-card__desc">通过微信 iLink 协议提供 AI 对话服务</p>
              </div>
            </div>
            <div class="settings-card__body">
              <!-- Bot 状态 -->
              <div class="settings-field">
                <label class="settings-field__label">Bot 状态</label>
                <div class="ilink-status">
                  <div :class="['status-dot', ilinkStore.status?.running ? 'status-dot--running' : 'status-dot--stopped']" />
                  <span>{{ ilinkStore.status?.running ? '运行中' : '已停止' }}</span>
                  <span v-if="ilinkStore.status?.running && ilinkStore.status?.uptime" class="status-uptime">
                    (已运行 {{ formatUptime(ilinkStore.status.uptime) }})
                  </span>
                  <span v-if="ilinkStore.status?.messages_processed" class="status-messages">
                    · 处理 {{ ilinkStore.status.messages_processed }} 条消息
                  </span>
                </div>
                <div v-if="ilinkStore.status?.error" class="status-error">
                  {{ ilinkStore.status.error }}
                </div>
              </div>

              <!-- Bot 控制按钮 -->
              <div class="settings-field">
                <div class="ilink-actions">
                  <n-button
                    v-if="!ilinkStore.status?.running"
                    type="primary"
                    :loading="ilinkStore.isLoading"
                    @click="handleStartBot"
                  >
                    启动 Bot
                  </n-button>
                  <n-button
                    v-if="ilinkStore.status?.running"
                    type="error"
                    :loading="ilinkStore.isLoading"
                    @click="handleStopBot"
                  >
                    停止 Bot
                  </n-button>
                </div>
                <div class="settings-field__hint">启动后将自动显示二维码，扫码登录即可</div>
              </div>

              <!-- 登录状态 -->
              <div class="settings-field">
                <label class="settings-field__label">登录状态</label>
                <div class="ilink-login">
                  <!-- 登录中 -->
                  <div v-if="ilinkStore.status?.login.status === 'waiting'" class="ilink-login__qrcode">
                    <div class="qrcode-status">
                      <div class="status-dot status-dot--waiting" />
                      <span>等待扫码登录...</span>
                    </div>
                    <div class="settings-field__hint">请查看服务器控制台获取二维码链接</div>
                  </div>

                  <!-- 已扫码 -->
                  <div v-else-if="ilinkStore.status?.login.status === 'scanned'" class="ilink-login__scanned">
                    <div class="status-dot status-dot--running" />
                    <span>已扫码，请在手机上确认登录</span>
                  </div>

                  <!-- 已登录 -->
                  <div v-else-if="ilinkStore.status?.login.status === 'confirmed'" class="ilink-login__logged">
                    <div class="status-dot status-dot--running" />
                    <span>已登录</span>
                    <n-button size="small" @click="handleResetLogin">
                      重新登录
                    </n-button>
                  </div>

                  <!-- 未启动 -->
                  <div v-else class="ilink-login__idle">
                    <div class="status-dot status-dot--stopped" />
                    <span>未启动</span>
                    <div class="settings-field__hint">点击「启动 Bot」后将自动显示二维码</div>
                  </div>
                </div>
              </div>

              <!-- AI 配置 -->
              <div class="settings-row">
                <div class="settings-field">
                  <label class="settings-field__label">AI 提供商</label>
                  <n-select
                    v-model:value="ilinkConfig.provider"
                    :options="settingsStore.availableProviders.map(p => ({ label: p.displayName, value: p.name }))"
                    placeholder="选择提供商"
                  />
                </div>
                <div class="settings-field">
                  <label class="settings-field__label">AI 模型</label>
                  <n-select
                    v-model:value="ilinkConfig.model"
                    :options="ilinkProviderModels"
                    :disabled="!ilinkConfig.provider"
                    placeholder="选择模型"
                  />
                </div>
              </div>

              <!-- System Prompt -->
              <div class="settings-field">
                <label class="settings-field__label">系统提示词</label>
                <n-input
                  v-model:value="ilinkConfig.system_prompt"
                  type="textarea"
                  :rows="3"
                  placeholder="定义 Bot 的角色和行为"
                />
              </div>

              <!-- Max Tool Rounds -->
              <div class="settings-field">
                <label class="settings-field__label">最大工具调用轮数</label>
                <n-input-number v-model:value="ilinkConfig.max_tool_rounds" :min="1" :max="10" />
                <div class="settings-field__hint">控制 Bot 在一次对话中最多调用工具的次数</div>
              </div>

              <!-- Save button -->
              <div class="settings-field">
                <n-button type="primary" :loading="ilinkStore.isLoading" @click="saveILinkConfig">
                  保存 Bot 配置
                </n-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.settings-page {
  min-height: 100%;
  position: relative;
}

.settings-page__bg {
  position: absolute;
  inset: 0;
  background: var(--bg-content-gradient);
  pointer-events: none;
}

.settings-content {
  position: relative;
  z-index: 1;
  max-width: 760px;
  margin: 0 auto;
  padding: 28px 28px;
}

/* Header */
.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
}

.settings-header__title {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}

.settings-header__btn {
  background: var(--accent-gradient) !important;
  border: none !important;
  box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);
  font-weight: 600;
  transition: all 0.2s ease;
}

.settings-header__btn:hover {
  box-shadow: 0 6px 20px rgba(245, 158, 11, 0.4);
  transform: translateY(-1px);
}

/* Sections */
.settings-section {
  margin-bottom: 20px;
}

/* Card */
.settings-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.settings-card__header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-secondary);
}

.settings-card__icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.settings-card__title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.settings-card__desc {
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.settings-card__body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Fields */
.settings-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.settings-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-field__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
}

/* Theme options */
.theme-options {
  display: flex;
  gap: 8px;
}

.theme-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 20px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex: 1;
}

.theme-option:hover {
  border-color: var(--accent-primary);
  background: var(--bg-card);
}

.theme-option--active {
  border-color: var(--accent-primary);
  background: rgba(245, 158, 11, 0.08);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
}

.theme-option__icon {
  font-size: 1.25rem;
}

.theme-option__label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.theme-option--active .theme-option__label {
  color: var(--accent-primary);
}

/* Collapse override */
.settings-collapse {
  margin-top: 4px;
}

:deep(.settings-collapse .n-collapse-item__header) {
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-primary);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  border: 1px solid var(--border-subtle);
}

:deep(.settings-collapse .n-collapse-item__content-wrapper) {
  padding-top: 12px;
}

:deep(.settings-collapse .n-collapse-item__content-inner) {
  padding-top: 0;
}

/* Knowledge Base subheader */
.settings-kb-subheader {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--text-primary);
  padding: 8px 0 4px;
  border-top: 1px dashed var(--border-subtle);
  margin-top: 4px;
}

/* iLink Bot styles */
.ilink-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot--running {
  background: #22c55e;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.3);
  animation: pulse 2s infinite;
}

.status-dot--stopped {
  background: #94a3b8;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-uptime, .status-messages {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.status-error {
  margin-top: 4px;
  padding: 6px 10px;
  background: rgba(220, 38, 38, 0.06);
  border: 1px solid rgba(220, 38, 38, 0.2);
  border-radius: 6px;
  font-size: 0.75rem;
  color: #dc2626;
}

.ilink-actions {
  display: flex;
  gap: 8px;
}

.ilink-login {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ilink-login__qrcode {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.qrcode-container {
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 8px;
  overflow: hidden;
}

.qrcode-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.qrcode-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.ilink-login__logged {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: rgba(34, 197, 94, 0.06);
  border: 1px solid rgba(34, 197, 94, 0.2);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  color: #16a34a;
}

/* Animations */
@keyframes slideIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-slideIn {
  animation: slideIn 0.35s ease-out forwards;
  opacity: 0;
}
</style>