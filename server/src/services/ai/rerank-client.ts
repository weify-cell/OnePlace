import OpenAI from 'openai'
import { getSettingValue } from '../settings.service.js'

export interface RerankResult {
  index: number
  docIndex: number
  score: number
}

export async function rerankText(
  query: string,
  documents: string[],
  provider: string,
  model: string
): Promise<RerankResult[]> {
  const aiProviders = getSettingValue<Record<string, { apiKey?: string; baseURL?: string }>>('ai_providers', {})
  const providerSettings = aiProviders[provider] || {}
  const apiKey = providerSettings.apiKey || 'sk-placeholder'
  const baseURL = providerSettings.baseURL || getDefaultBaseURL(provider)

  if (provider === 'cohere') {
    return rerankCohere(query, documents, apiKey, baseURL)
  }

  if (provider === 'jina') {
    return rerankJina(query, documents, apiKey, baseURL)
  }

  if (provider === 'qwen') {
    return rerankQwen(query, documents, apiKey, baseURL, model)
  }

  // Default: OpenAI-compatible rerank endpoint (local models, custom APIs)
  return rerankOpenAICompatible(query, documents, apiKey, baseURL, model)
}

async function rerankCohere(query: string, documents: string[], apiKey: string, baseURL: string): Promise<RerankResult[]> {
  const response = await fetch(`${baseURL}/rerank`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'rerank-v3',
      query,
      documents,
      top_n: documents.length
    })
  })

  if (!response.ok) {
    throw new Error(`Cohere rerank failed: ${response.status}`)
  }

  const data = await response.json() as { results: { index: number; relevance_score: number }[] }
  return data.results.map(r => ({
    index: r.index,
    docIndex: r.index,
    score: r.relevance_score
  })).sort((a, b) => b.score - a.score)
}

async function rerankJina(query: string, documents: string[], apiKey: string, baseURL: string): Promise<RerankResult[]> {
  const response = await fetch(`${baseURL}/rerank`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'jina-reranker-v2-base',
      query,
      documents,
      top_n: documents.length
    })
  })

  if (!response.ok) {
    throw new Error(`Jina rerank failed: ${response.status}`)
  }

  const data = await response.json() as { results: { index: number; relevance_score: number }[] }
  return data.results.map(r => ({
    index: r.index,
    docIndex: r.index,
    score: r.relevance_score
  })).sort((a, b) => b.score - a.score)
}

async function rerankOpenAICompatible(
  query: string,
  documents: string[],
  apiKey: string,
  baseURL: string,
  model: string
): Promise<RerankResult[]> {
  const base = baseURL.replace(/\/$/, '')
  const apiBase = base.endsWith('/v1') ? base : `${base}/v1`

  const client = new OpenAI({ apiKey, baseURL: apiBase, dangerouslyAllowBrowser: true })

  try {
    // Use instruction-tuned model to score query-document relevance
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'You are a relevance scorer. Rate how relevant each document is to the query. Output a JSON array of scores like: [{\"index\":0,\"score\":0.95},{\"index\":1,\"score\":0.80}]' },
        { role: 'user', content: `Query: ${query}\n\nDocuments:\n${documents.map((doc, i) => `[${i}] ${doc.slice(0, 400)}`).join('\n')}\n\nRespond with a JSON array only.` }
      ],
      temperature: 0
    })

    const content = response.choices[0]?.message?.content || ''
    return parseRerankResponse(content, documents.length)
  } catch (err) {
    console.error(`[rerank] OpenAI-compatible rerank failed:`, err)
    throw err
  }
}

function fallbackRerank(docCount: number): RerankResult[] {
  return Array.from({ length: docCount }, (_, i) => ({
    index: i,
    docIndex: i,
    score: 1.0
  }))
}

async function rerankQwen(
  query: string,
  documents: string[],
  apiKey: string,
  baseURL: string,
  model: string
): Promise<RerankResult[]> {
  // baseURL is like https://dashscope.aliyuncs.com/compatible-mode/v1
  // Rerank endpoint: /compatible-api/v1/reranks
  const base = baseURL.replace(/\/$/, '')
  const apiBase = base.includes('/compatible-api') ? base : base.replace('/compatible-mode', '/compatible-api')

  try {
    const response = await fetch(`${apiBase}/reranks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'qwen3-rerank',
        documents,
        query,
        top_n: documents.length,
        instruct: 'Given a web search query, retrieve relevant passages that answer the query.'
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json() as { results: { index: number; relevance_score: number }[] }
    return data.results.map(r => ({
      index: r.index,
      docIndex: r.index,
      score: r.relevance_score
    })).sort((a, b) => b.score - a.score)
  } catch (err) {
    console.warn(`[rerank] Qwen rerank failed (${(err as Error).message}), using vector scores`)
    return fallbackRerank(documents.length)
  }
}

function parseRerankResponse(content: string, docCount: number): RerankResult[] {
  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) {
      return parsed.map((item, idx) => ({
        index: idx,
        docIndex: typeof item.index === 'number' ? item.index : idx,
        score: typeof item.score === 'number' ? item.score : 0
      })).filter(r => r.docIndex >= 0 && r.docIndex < docCount)
    }
  } catch {
    // Fallback: try to parse line-by-line format "1. score: 0.95" or "1. 0.95"
  }

  const results: RerankResult[] = []
  const lines = content.split('\n')
  for (const line of lines) {
    const match = line.match(/^(\d+)[.)\s]+(?:score[:\s]+)?([\d.]+)/i)
    if (match) {
      results.push({
        index: results.length,
        docIndex: parseInt(match[1]) - 1,
        score: parseFloat(match[2])
      })
    }
  }
  return results.sort((a, b) => b.score - a.score)
}

function getDefaultBaseURL(provider: string): string {
  const baseURLs: Record<string, string> = {
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    openai: 'https://api.openai.com/v1',
    cohere: 'https://api.cohere.ai/v1',
    jina: 'https://api.jina.ai/v1'
  }
  return baseURLs[provider] || ''
}

// Wrapper that falls back to vector search scores when rerank is unavailable
export async function rerankTextWithFallback(
  query: string,
  documents: string[],
  provider: string,
  model: string,
  vectorScores?: number[]
): Promise<RerankResult[]> {
  try {
    const result = await rerankText(query, documents, provider, model)
    return result
  } catch (err) {
    console.warn(`[rerank] ${provider} rerank failed (${(err as Error).message}), falling back to vector scores`)
    return documents.map((_, i) => ({
      index: i,
      docIndex: i,
      score: vectorScores && vectorScores[i] !== undefined ? vectorScores[i] : 1.0
    }))
  }
}