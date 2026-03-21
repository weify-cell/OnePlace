import OpenAI from 'openai'
import { AI_PROVIDERS } from './providers.js'
import { getSettingValue } from '../settings.service.js'

export function createAIClient(provider: string): { client: OpenAI; apiKey: string } {
  const providerConfig = AI_PROVIDERS[provider] || AI_PROVIDERS.qwen

  // Get API key from settings
  const aiProviders = getSettingValue<Record<string, { apiKey?: string; baseURL?: string }>>('ai_providers', {})
  const providerSettings = aiProviders[provider] || {}
  const apiKey = providerSettings.apiKey || 'sk-placeholder'
  const baseURL = provider === 'custom' ? (providerSettings.baseURL || '') : providerConfig.baseURL

  const client = new OpenAI({ apiKey, baseURL })
  return { client, apiKey }
}
