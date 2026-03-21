<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useSettingsStore } from '@/stores/settings.store'
import AppLayout from '@/components/common/AppLayout.vue'

const settingsStore = useSettingsStore()
const message = useMessage()
const saving = ref(false)

// Local form state
const providers = ref<Record<string, { apiKey: string; baseURL: string }>>({})
const defaultProvider = ref('')
const defaultModel = ref('')
const theme = ref<'light' | 'dark' | 'system'>('system')

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
</script>

<template>
  <AppLayout>
    <div class="p-6 max-w-2xl mx-auto">
      <div class="flex-between mb-6">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">设置</h1>
        <n-button type="primary" :loading="saving" @click="saveAll">保存设置</n-button>
      </div>

      <!-- Theme -->
      <n-card title="外观" class="mb-4">
        <n-form-item label="主题">
          <n-radio-group v-model:value="theme">
            <n-radio-button v-for="opt in themeOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </n-radio-button>
          </n-radio-group>
        </n-form-item>
      </n-card>

      <!-- AI Provider -->
      <n-card title="AI 对话配置" class="mb-4">
        <n-form label-placement="top">
          <div class="grid grid-cols-2 gap-4 mb-4">
            <n-form-item label="默认提供商">
              <n-select
                v-model:value="defaultProvider"
                :options="settingsStore.availableProviders.map(p => ({ label: p.displayName, value: p.name }))"
                @update:value="defaultModel = ''"
              />
            </n-form-item>
            <n-form-item label="默认模型">
              <n-select
                v-model:value="defaultModel"
                :options="currentProviderModels"
                :disabled="!defaultProvider"
              />
            </n-form-item>
          </div>

          <n-collapse>
            <n-collapse-item
              v-for="p in settingsStore.availableProviders"
              :key="p.name"
              :title="`${p.displayName} API 配置`"
              :name="p.name"
            >
              <n-form-item label="API Key">
                <n-input
                  v-if="providers[p.name]"
                  v-model:value="providers[p.name].apiKey"
                  type="password"
                  show-password-on="click"
                  :placeholder="`${p.displayName} API Key`"
                />
              </n-form-item>
              <n-form-item v-if="p.name === 'custom'" label="Base URL">
                <n-input
                  v-if="providers[p.name]"
                  v-model:value="providers[p.name].baseURL"
                  placeholder="https://..."
                />
              </n-form-item>
            </n-collapse-item>
          </n-collapse>
        </n-form>
      </n-card>
    </div>
  </AppLayout>
</template>
