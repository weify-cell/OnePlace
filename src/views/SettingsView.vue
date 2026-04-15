<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore } from '@/stores/settings.store'
import AppLayout from '@/components/common/AppLayout.vue'
import { knowledgeBaseApi } from '@/api/knowledge-base.api'

const settingsStore = useSettingsStore()
const message = useMessage()
const saving = ref(false)

// Local form state
const providers = ref<Record<string, { apiKey: string; baseURL: string }>>({})
const defaultProvider = ref('')
const defaultModel = ref('')
const theme = ref<'light' | 'dark' | 'system'>('system')

const kbSettings = ref({
  kb_enabled: false,
  embedding_provider: 'qwen',
  embedding_model: 'text-embedding-v2',
  qdrant_url: 'http://localhost:6333',
  qdrant_collection: 'notes_knowledge_base',
  kb_chunk_size: 500,
  kb_chunk_overlap: 50,
  kb_default_enabled: false,
})

const embeddingProviderOptions = [
  { label: '通义千问', value: 'qwen' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'OpenAI', value: 'openai' },
]

const savingKb = ref(false)

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
  loadKbSettings()
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

async function saveAll() {
  saving.value = true
  try {
    await settingsStore.saveSetting('theme', theme.value)
    await settingsStore.saveSetting('default_provider', defaultProvider.value)
    await settingsStore.saveSetting('default_model', defaultModel.value)
    // Build ai_providers config
    const aiConfig: Record<string, { apiKey?: string; baseURL?: string }> = {}
    for (const [name, cfg] of Object.entries(providers.value)) {
      if (cfg.apiKey || cfg.baseURL) {
        aiConfig[name] = { apiKey: cfg.apiKey || undefined, baseURL: cfg.baseURL || undefined }
      }
    }
    await settingsStore.saveSetting('ai_providers', aiConfig)
    message.success('设置已保存')
  } finally {
    saving.value = false
  }
}

async function loadKbSettings() {
  const res = await knowledgeBaseApi.getSettings()
  Object.assign(kbSettings.value, res.data.data)
}

async function saveKbSettings() {
  savingKb.value = true
  try {
    await knowledgeBaseApi.updateSettings(kbSettings.value)
    window.$message.success('知识库配置已保存')
  } finally {
    savingKb.value = false
  }
}
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
        <n-divider>知识库</n-divider>

        <div class="settings-section animate-slideIn" style="animation-delay: 150ms">
          <div class="settings-card">
            <div class="settings-card__header">
              <div class="settings-card__icon">📚</div>
              <div>
                <h2 class="settings-card__title">知识库配置</h2>
                <p class="settings-card__desc">配置 Embedding 和向量数据库</p>
              </div>
            </div>
            <div class="settings-card__body">
              <div class="settings-row">
                <div class="settings-field">
                  <label class="settings-field__label">启用知识库功能</label>
                  <n-switch v-model:value="kbSettings.kb_enabled" />
                </div>
                <div class="settings-field">
                  <label class="settings-field__label">新对话默认启用</label>
                  <n-switch v-model:value="kbSettings.kb_default_enabled" />
                </div>
              </div>

              <div class="settings-row">
                <div class="settings-field">
                  <label class="settings-field__label">Embedding 服务商</label>
                  <n-select
                    v-model:value="kbSettings.embedding_provider"
                    :options="embeddingProviderOptions"
                    placeholder="选择服务商"
                  />
                </div>
                <div class="settings-field">
                  <label class="settings-field__label">Embedding 模型</label>
                  <n-input
                    v-model:value="kbSettings.embedding_model"
                    placeholder="如 text-embedding-v2"
                  />
                </div>
              </div>

              <div class="settings-row">
                <div class="settings-field">
                  <label class="settings-field__label">Qdrant 地址</label>
                  <n-input
                    v-model:value="kbSettings.qdrant_url"
                    placeholder="http://localhost:6333"
                  />
                </div>
                <div class="settings-field">
                  <label class="settings-field__label">Collection</label>
                  <n-input
                    v-model:value="kbSettings.qdrant_collection"
                    placeholder="notes_knowledge_base"
                  />
                </div>
              </div>

              <div class="settings-row">
                <div class="settings-field">
                  <label class="settings-field__label">分块大小</label>
                  <n-input-number
                    v-model:value="kbSettings.kb_chunk_size"
                    :min="100"
                    :max="2000"
                    style="width: 120px"
                  />
                  <span class="settings-field__hint">字</span>
                </div>
                <div class="settings-field">
                  <label class="settings-field__label">重叠字数</label>
                  <n-input-number
                    v-model:value="kbSettings.kb_chunk_overlap"
                    :min="0"
                    :max="500"
                    style="width: 120px"
                  />
                  <span class="settings-field__hint">字</span>
                </div>
              </div>

              <div class="settings-field__actions">
                <n-button type="primary" :loading="savingKb" @click="saveKbSettings">
                  保存知识库配置
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

.settings-field__hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-left: 4px;
}

.settings-field__actions {
  margin-top: 12px;
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
