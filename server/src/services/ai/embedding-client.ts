import OpenAI from 'openai'
import { AI_PROVIDERS } from './providers.js'
import { getSettingValue } from '../settings.service.js'

export const EMBEDDING_DIMENSIONS: Record<string, number> = {
  'text-embedding-v2': 1536,
  'text-embedding-v3': 1536,
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
  'deepseek-embedder': 1024,
}

export function getEmbeddingDimension(provider: string, model: string): number {
  return EMBEDDING_DIMENSIONS[model] || 1024
}

export function createEmbeddingClient(provider: string) {
  const providerConfig = AI_PROVIDERS[provider]
  if (!providerConfig) throw new Error(`Unknown embedding provider: ${provider}`)

  const aiProviders = getSettingValue<Record<string, { apiKey?: string; baseURL?: string }>>('ai_providers', {})
  const providerSettings = aiProviders[provider] || {}
  const apiKey = providerSettings.apiKey || 'sk-placeholder'
  const baseURL = provider === 'custom' ? (providerSettings.baseURL || '') : providerConfig.baseURL

  const client = new OpenAI({ apiKey, baseURL })
  return { client, apiKey }
}

export async function embedText(text: string, provider: string, model: string): Promise<number[]> {
  const { client } = createEmbeddingClient(provider)
  const response = await client.embeddings.create({
    model,
    input: text
  })
  return response.data[0].embedding
}

export async function embedTexts(texts: string[], provider: string, model: string): Promise<number[][]> {
  if (texts.length === 0) return []
  const { client } = createEmbeddingClient(provider)
  const response = await client.embeddings.create({
    model,
    input: texts
  })
  return response.data.map(d => d.embedding)
}
