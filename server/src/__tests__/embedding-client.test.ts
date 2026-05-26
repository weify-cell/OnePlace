import { embedText } from '../services/ai/embedding-client.js'

describe('embedding-client', () => {
  it('should call embedText and return vector array', async () => {
    const result = await embedText('hello world', 'qwen', 'text-embedding-v4')
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThan(0)
  })
})