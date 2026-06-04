import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '@/api'

export interface ILinkBotStatus {
  running: boolean
  uptime: number | null
  messages_processed: number
  last_message_at: string | null
  error: string | null
  login: {
    status: 'idle' | 'waiting' | 'scanned' | 'confirmed' | 'expired'
    qrcode: string | null
  }
  config: {
    enabled: boolean
    provider: string
    model: string
  }
}

export interface ILinkConfig {
  enabled: boolean
  provider: string
  model: string
  system_prompt: string
  max_tool_rounds: number
}

export const useILinkStore = defineStore('ilink', () => {
  const status = ref<ILinkBotStatus | null>(null)
  const config = ref<ILinkConfig | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchStatus() {
    try {
      const res = await api.get('/ilink/status')
      status.value = res.data
    } catch (err) {
      console.error('Failed to fetch iLink status:', err)
    }
  }

  async function fetchConfig() {
    try {
      const res = await api.get('/ilink/config')
      config.value = res.data
    } catch (err) {
      console.error('Failed to fetch iLink config:', err)
    }
  }

  async function updateConfig(updates: Partial<ILinkConfig>) {
    isLoading.value = true
    error.value = null
    try {
      await api.put('/ilink/config', updates)
      await fetchConfig()
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to update config'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function startBot() {
    isLoading.value = true
    error.value = null
    try {
      const res = await api.post('/ilink/start')
      if (res.data.success) {
        status.value = res.data.status
      } else {
        error.value = res.data.error
      }
      return res.data
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to start bot'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function stopBot() {
    isLoading.value = true
    error.value = null
    try {
      const res = await api.post('/ilink/stop')
      if (res.data.success) {
        status.value = res.data.status
      } else {
        error.value = res.data.error
      }
      return res.data
    } catch (err: any) {
      error.value = err.response?.data?.error || err.message || 'Failed to stop bot'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function resetLogin() {
    try {
      await api.post('/ilink/login/reset')
      await fetchStatus()
    } catch (err) {
      console.error('Failed to reset login:', err)
    }
  }

  function clearError() {
    error.value = null
  }

  return {
    status,
    config,
    isLoading,
    error,
    fetchStatus,
    fetchConfig,
    updateConfig,
    startBot,
    stopBot,
    resetLogin,
    clearError
  }
})
