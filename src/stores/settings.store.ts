import { defineStore } from 'pinia'
import { settingsApi } from '@/api/settings.api'
import type { AIProviderInfo } from '@/types'

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<'light' | 'dark' | 'system'>('system')
  const defaultProvider = ref('qwen')
  const defaultModel = ref('qwen-turbo')
  const aiProviders = ref<Record<string, { apiKey?: string; baseURL?: string }>>({})
  const availableProviders = ref<AIProviderInfo[]>([])

  async function loadSettings() {
    try {
      const res = await settingsApi.getAll()
      const s = res.data
      theme.value = s.theme || 'system'
      defaultProvider.value = s.default_provider || 'qwen'
      defaultModel.value = s.default_model || 'qwen-turbo'
      aiProviders.value = s.ai_providers || {}
      availableProviders.value = s.available_providers || []
    } catch {
      // use defaults
    }
  }

  async function saveSetting(key: string, value: unknown) {
    await settingsApi.set(key, value)
    if (key === 'theme') theme.value = value as 'light' | 'dark' | 'system'
    if (key === 'default_provider') defaultProvider.value = value as string
    if (key === 'default_model') defaultModel.value = value as string
    if (key === 'ai_providers') aiProviders.value = value as Record<string, { apiKey?: string }>
  }

  return { theme, defaultProvider, defaultModel, aiProviders, availableProviders, loadSettings, saveSetting }
})
