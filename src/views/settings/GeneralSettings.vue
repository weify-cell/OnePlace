<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useSettingsStore } from '@/stores/settings.store'
import SettingsLayout from './SettingsLayout.vue'

const settingsStore = useSettingsStore()
const message = useMessage()
const saving = ref(false)

const providers = ref<Record<string, { apiKey: string; baseURL: string }>>({})
const defaultProvider = ref('')
const defaultModel = ref('')
const theme = ref<'light' | 'dark' | 'system'>('system')

watch(theme, (val) => { settingsStore.theme = val })

onMounted(async () => {
  await settingsStore.loadSettings()
  defaultProvider.value = settingsStore.defaultProvider
  defaultModel.value = settingsStore.defaultModel
  theme.value = settingsStore.theme
  for (const p of settingsStore.availableProviders) {
    providers.value[p.name] = {
      apiKey: settingsStore.aiProviders[p.name]?.apiKey || '',
      baseURL: settingsStore.aiProviders[p.name]?.baseURL || ''
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

async function saveAll() {
  saving.value = true
  try {
    await settingsStore.saveSetting('theme', theme.value)
    await settingsStore.saveSetting('default_provider', defaultProvider.value)
    await settingsStore.saveSetting('default_model', defaultModel.value)
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
</script>

<template>
  <SettingsLayout title="通用配置" :saving="saving" @save="saveAll">
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
  </SettingsLayout>
</template>

<style scoped src="./settings.css"></style>
