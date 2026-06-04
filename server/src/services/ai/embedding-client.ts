import OpenAI from 'openai'
import { getSettingValue } from '../settings.service.js'

export async function embedText(
  text: string,
  provider: string,
  model: string
): Promise<number[]> {
  const aiProviders = getSettingValue<Record<string, { apiKey?: string; baseURL?: string }>>('ai_providers', {})
  const providerSettings = aiProviders[provider] || {}
  const apiKey = providerSettings.apiKey || 'sk-placeholder'
  const baseURL = providerSettings.baseURL || getDefaultBaseURL(provider)

  try {
    const client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true })
    const response = await client.embeddings.create({ model, input: text })
    return response.data[0].embedding
  } catch (err) {
    console.error(`[embedding] ${provider}/${model} failed:`, err)
    throw err
  }
}

function getDefaultBaseURL(provider: string): string {
  const baseURLs: Record<string, string> = {
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    openai: 'https://api.openai.com/v1'
  }
  return baseURLs[provider] || ''
}