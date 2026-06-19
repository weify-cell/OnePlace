import { describe, it, expect, vi, beforeEach } from 'vitest'
import OpenAI from 'openai'
import { embedText } from '../services/ai/embedding-client.js'

const createEmbedding = vi.fn()
const openAIConstructor = vi.fn()

vi.mock('openai', () => ({
  default: class MockOpenAI {
    embeddings = {
      create: createEmbedding
    }

    constructor(...args: unknown[]) {
      openAIConstructor(...args)
    }
  }
}))

describe('embedding-client', () => {
  beforeEach(() => {
    createEmbedding.mockReset()
  })

  it('should call embedText and return vector array', async () => {
    createEmbedding.mockResolvedValueOnce({
      data: [{ embedding: [0.11, 0.22, 0.33] }]
    })

    const result = await embedText('hello world', 'qwen', 'text-embedding-v4')

    expect(OpenAI).toBeDefined()
    expect(openAIConstructor).toHaveBeenCalled()
    expect(createEmbedding).toHaveBeenCalledWith({ model: 'text-embedding-v4', input: 'hello world' })
    expect(Array.isArray(result)).toBe(true)
    expect(result).toEqual([0.11, 0.22, 0.33])
  })
})
