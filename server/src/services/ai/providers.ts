export interface AIProvider {
  name: string
  displayName: string
  baseURL: string
  models: { id: string; name: string }[]
  embedding_models?: { id: string; name: string }[]
}

export const AI_PROVIDERS: Record<string, AIProvider> = {
  qwen: {
    name: 'qwen',
    displayName: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen-turbo', name: 'Qwen Turbo' },
      { id: 'qwen-plus', name: 'Qwen Plus' },
      { id: 'qwen-max', name: 'Qwen Max' },
      { id: 'qwen-long', name: 'Qwen Long' }
    ],
    embedding_models: [
      { id: 'text-embedding-v2', name: 'Text Embedding V2' },
      { id: 'text-embedding-v3', name: 'Text Embedding V3' }
    ]
  },
  kimi: {
    name: 'kimi',
    displayName: 'Kimi',
    baseURL: 'https://api.moonshot.cn/v1',
    models: [
      { id: 'moonshot-v1-8k', name: 'Moonshot 8k' },
      { id: 'moonshot-v1-32k', name: 'Moonshot 32k' },
      { id: 'moonshot-v1-128k', name: 'Moonshot 128k' }
    ]
  },
  zhipu: {
    name: 'zhipu',
    displayName: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { id: 'glm-4', name: 'GLM-4' },
      { id: 'glm-4-flash', name: 'GLM-4 Flash' },
      { id: 'glm-3-turbo', name: 'GLM-3 Turbo' }
    ]
  },
  deepseek: {
    name: 'deepseek',
    displayName: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' }
    ],
    embedding_models: [
      { id: 'deepseek-embedder', name: 'DeepSeek Embedder' }
    ]
  },
  openai: {
    name: 'openai',
    displayName: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' }
    ],
    embedding_models: [
      { id: 'text-embedding-3-small', name: 'Text Embedding 3 Small' },
      { id: 'text-embedding-3-large', name: 'Text Embedding 3 Large' },
      { id: 'text-embedding-ada-002', name: 'Text Embedding Ada 002' }
    ]
  }
}
