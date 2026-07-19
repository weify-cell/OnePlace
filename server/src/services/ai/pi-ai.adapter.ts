import { stream } from '@earendil-works/pi-ai/api/openai-completions'
import type { Model, Message } from '@earendil-works/pi-ai'
import type { StreamFn } from '@earendil-works/pi-agent-core'
import { getSettingValue } from '../settings.service.js'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

const BASE_URL_MAP: Record<string, string> = {
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  deepseek: 'https://api.deepseek.com/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  moonshot: 'https://api.moonshot.cn/v1',
  kimi: 'https://api.moonshot.cn/v1',
}

export function extractApiKey(provider: string): string {
  const providers = getSettingValue<Record<string, unknown>>('ai_providers', {})
  const entry = providers[provider]
  if (entry && typeof entry === 'object') {
    return (entry as Record<string, unknown>).apiKey as string || ''
  }
  return ''
}

export function createModel(provider: string, modelId: string): Model<'openai-completions'> {
  const baseUrl = getSettingValue<string>(`${provider}_base_url`, BASE_URL_MAP[provider] || '')
  return {
    id: modelId, name: modelId, api: 'openai-completions',
    provider: provider as Model<'openai-completions'>['provider'],
    baseUrl, reasoning: false, input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000, maxTokens: 8192,
  }
}

export function createStreamFn(): StreamFn {
  return (model, context, options) => stream(model as Model<'openai-completions'>, context, options)
}

export function convertMessages(messages: ChatMessage[]): Message[] {
  return messages.map(m => {
    if (m.role === 'system') {
      return { role: 'system', content: m.content } as unknown as Message
    }
    if (m.role === 'assistant') {
      return { role: 'assistant', content: [{ type: 'text' as const, text: m.content }] } as unknown as Message
    }
    return { role: 'user', content: m.content } as unknown as Message
  })
}
