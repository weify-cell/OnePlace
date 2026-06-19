import { defineStore } from 'pinia'
import { settingsApi } from '@/api/settings.api'
import type { AIProviderInfo } from '@/types'

let globalLoadPromise: Promise<void> | null = null

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<'light' | 'dark' | 'system'>('system')
  const defaultProvider = ref('qwen')
  const defaultModel = ref('qwen-turbo')
  const aiProviders = ref<Record<string, { apiKey?: string; baseURL?: string }>>({})
  const availableProviders = ref<AIProviderInfo[]>([])
  const hasLoaded = ref(false)

  async function loadSettings(force = false) {
    if (!force && hasLoaded.value) return
    if (!force && globalLoadPromise) return globalLoadPromise

    globalLoadPromise = (async () => {
      try {
        const res = await settingsApi.getAll()
        const s = res.data
        theme.value = s.theme || 'system'
        defaultProvider.value = s.default_provider || 'qwen'
        defaultModel.value = s.default_model || 'qwen-turbo'
        aiProviders.value = s.ai_providers || {}
        availableProviders.value = s.available_providers || []
        hasLoaded.value = true
      } catch {
        // Keep defaults on failure.
      } finally {
        globalLoadPromise = null
      }
    })()

    return globalLoadPromise
  }

  function resetSettingsState() {
    theme.value = 'system'
    defaultProvider.value = 'qwen'
    defaultModel.value = 'qwen-turbo'
    aiProviders.value = {}
    availableProviders.value = []
    hasLoaded.value = false
    globalLoadPromise = null
  }

  async function saveSetting(key: string, value: unknown) {
    await settingsApi.set(key, value)
    if (key === 'theme') theme.value = value as 'light' | 'dark' | 'system'
    if (key === 'default_provider') defaultProvider.value = value as string
    if (key === 'default_model') defaultModel.value = value as string
    if (key === 'ai_providers') aiProviders.value = value as Record<string, { apiKey?: string; baseURL?: string }>
    hasLoaded.value = true
  }

  return {
    theme,
    defaultProvider,
    defaultModel,
    aiProviders,
    availableProviders,
    hasLoaded,
    loadSettings,
    resetSettingsState,
    saveSetting
  }
})
