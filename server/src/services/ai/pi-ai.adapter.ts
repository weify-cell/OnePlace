import { stream as piStream } from '@earendil-works/pi-ai'
import type { Model, Context, Api, Message, UserMessage, AssistantMessage, ToolCall as PiToolCall, AssistantMessageEvent } from '@earendil-works/pi-ai'
import { getSettingValue } from '../settings.service.js'
import { executeToolCall, getToolDefinitions, toolCallToRecord, toolResultToRecord } from './tools.registry.js'
import type { ToolResult } from './tools.registry.js'

// Provider → baseUrl 映射
const BASE_URL_MAP: Record<string, string> = {
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  deepseek: 'https://api.deepseek.com/v1',
  openai: 'https://api.openai.com/v1'
}

// ────────────────────── 类型定义 ──────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/** 流式结果 */
export interface StreamResult {
  content: string
  tokensUsed: number | null
  stopReason: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted'
  toolCalls: PiToolCall[]
  toolCallRecords: Array<{ id: string; name: string; arguments: Record<string, any>; result: string; isError: boolean }>
}

/** 流式回调 */
export interface StreamCallbacks {
  onStart?: () => void
  onTextStart?: () => void
  onDelta?: (content: string) => void
  onThinkingStart?: () => void
  onThinkingDelta?: (content: string) => void
  onThinkingEnd?: (content: string) => void
  onToolCallStart?: (toolCall: PiToolCall) => void
  onToolCallDelta?: (name: string, partialArgs: string) => void
  onToolCallEnd?: (toolCall: PiToolCall) => void
  onToolResult?: (record: { id: string; name: string; result: string; isError: boolean }) => void
  onRoundEnd?: (round: number, result: Partial<StreamResult>) => void
  onDone?: (result: StreamResult) => void
  onError?: (error: Error) => void
}

// ────────────────────── 内部工具函数 ──────────────────────

/** 创建 pi-ai Model 对象 */
function createModel(provider: string, modelId: string, baseUrl: string): Model<Api> {
  return {
    id: modelId,
    name: modelId,
    api: 'openai-completions',
    provider: provider as any,
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096
  }
}

/** ChatMessage[] → pi-ai Message[] */
function convertMessages(messages: ChatMessage[]): Message[] {
  const now = Date.now()
  return messages.map((m, i): Message => {
    const ts = now - (messages.length - i) * 1000
    if (m.role === 'user' || m.role === 'system') {
      return { role: 'user', content: m.content, timestamp: ts } as UserMessage
    }
    // assistant
    return {
      role: 'assistant',
      content: [{ type: 'text', text: m.content }],
      api: 'openai-completions',
      provider: 'openai',
      model: 'unknown',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: 'stop',
      timestamp: ts
    } as unknown as AssistantMessage
  })
}

/** 获取 API 配置 */
function getApiConfig(provider: string): { apiKey: string; baseUrl: string } {
  const aiProviders = getSettingValue<Record<string, { apiKey?: string; baseURL?: string }>>('ai_providers', {})
  const s = aiProviders[provider] || {}
  return {
    apiKey: s.apiKey || process.env[`${provider.toUpperCase()}_API_KEY`] || '',
    baseUrl: s.baseURL || BASE_URL_MAP[provider] || ''
  }
}

// ────────────────────── 单轮流式处理 ──────────────────────

/** 处理单轮事件流，返回该轮结果 */
async function processEventStream(
  eventStream: AsyncIterable<AssistantMessageEvent>,
  callbacks?: StreamCallbacks,
  isToolRound = false
): Promise<{ content: string; tokensUsed: number | null; stopReason: string; toolCalls: PiToolCall[] }> {
  let content = ''
  let tokensUsed: number | null = null
  let stopReason = 'stop'
  const toolCalls: PiToolCall[] = []
  let currentToolCall: PiToolCall | null = null
  let currentToolName = ''
  let currentToolArgs = ''

  let eventCount = 0
  let thinkingDeltaCount = 0
  let textDeltaCount = 0

  for await (const event of eventStream) {
    eventCount++
    switch (event.type) {
      case 'start':
        console.log(`[pi-ai] event #${eventCount}: start`)
        callbacks?.onStart?.()
        break
      case 'text_start':
        console.log(`[pi-ai] event #${eventCount}: text_start`)
        if (!isToolRound) callbacks?.onTextStart?.()
        break
      case 'text_delta':
        content += event.delta
        textDeltaCount++
        if (!isToolRound) callbacks?.onDelta?.(event.delta)
        break
      case 'text_end':
        content = event.content
        console.log(`[pi-ai] event #${eventCount}: text_end ${event.content.length}c (total ${textDeltaCount} deltas)`)
        break
      case 'thinking_start':
        console.log(`[pi-ai] event #${eventCount}: thinking_start`)
        callbacks?.onThinkingStart?.()
        break
      case 'thinking_delta':
        thinkingDeltaCount++
        callbacks?.onThinkingDelta?.(event.delta)
        break
      case 'thinking_end':
        console.log(`[pi-ai] event #${eventCount}: thinking_end ${event.content.length}c (total ${thinkingDeltaCount} deltas)`)
        thinkingDeltaCount = 0
        callbacks?.onThinkingEnd?.(event.content)
        break
      case 'toolcall_start': {
        const tc = event.partial.content[event.contentIndex]
        if (tc && tc.type === 'toolCall') {
          currentToolCall = tc as PiToolCall
          currentToolName = currentToolCall.name
          currentToolArgs = ''
          console.log(`[pi-ai] event #${eventCount}: toolcall_start name=${currentToolName}`)
          callbacks?.onToolCallStart?.(currentToolCall)
        }
        break
      }
      case 'toolcall_delta':
        currentToolArgs += event.delta
        callbacks?.onToolCallDelta?.(currentToolName, event.delta)
        break
      case 'toolcall_end':
        toolCalls.push(event.toolCall)
        console.log(`[pi-ai] event #${eventCount}: toolcall_end name=${event.toolCall.name} args=${JSON.stringify(event.toolCall.arguments).slice(0, 100)}`)
        currentToolCall = null
        callbacks?.onToolCallEnd?.(event.toolCall)
        break
      case 'done':
        stopReason = event.reason
        tokensUsed = event.message.usage?.totalTokens || null
        console.log(`[pi-ai] event #${eventCount}: done reason=${stopReason} tokens=${tokensUsed} content=${content.length}c tools=${toolCalls.length}`)
        break
      case 'error': {
        const errorPayload = event.error as { content?: Array<{ type?: string; text?: string }> } | undefined
        const msg = errorPayload?.content?.find(item => item.type === 'text')?.text || `Stream ${event.reason}`
        console.error(`[pi-ai] event #${eventCount}: error: ${msg}`)
        if (content) {
          return { content, tokensUsed, stopReason: 'error', toolCalls }
        }
        callbacks?.onError?.(new Error(msg))
        return { content: '', tokensUsed: null, stopReason: 'error', toolCalls: [] }
      }
    }
  }

  return { content, tokensUsed, stopReason, toolCalls }
}

// ────────────────────── Agent Loop ──────────────────────

/**
 * 流式聊天：支持全量事件 + agent loop（多轮工具调用）
 */
export async function streamChatWithPi(
  provider: string,
  modelId: string,
  messages: ChatMessage[],
  systemPrompt?: string,
  callbacks?: StreamCallbacks,
  options?: { toolsEnabled?: boolean; maxRounds?: number }
): Promise<StreamResult> {
  const { apiKey, baseUrl } = getApiConfig(provider)
  const model = createModel(provider, modelId, baseUrl)

  // 构建 Context（含工具定义）
  const tools = options?.toolsEnabled ? getToolDefinitions() : []
  const context: Context = {
    systemPrompt,
    messages: convertMessages(messages),
    tools: tools.length > 0 ? tools : undefined
  }

  const streamOptions = { apiKey, maxTokens: 4096 }
  const maxRounds = options?.maxRounds ?? 5

  console.log(`[pi-ai] streamChatWithPi: provider=${provider} model=${modelId} tools=${tools.length} maxRounds=${maxRounds}`)
  console.log(`[pi-ai] ========== 上下文 START ==========`)
  if (systemPrompt) {
    console.log(`[pi-ai] systemPrompt: ${systemPrompt.slice(0, 200)}${systemPrompt.length > 200 ? '...' : ''}`)
  }
  messages.forEach((m, i) => {
    const preview = m.content.slice(0, 100)
    console.log(`[pi-ai] msg[${i}] ${m.role}: ${preview}${m.content.length > 100 ? '...' : ''}`)
  })
  if (tools.length > 0) {
    console.log(`[pi-ai] tools: ${tools.map(t => t.name).join(', ')}`)
  }
  console.log(`[pi-ai] ========== 上下文 END ==========`)

  let fullContent = ''
  let tokensUsed: number | null = null
  let stopReason: 'stop' | 'length' | 'toolUse' | 'error' | 'aborted' = 'stop'
  const allToolCalls: PiToolCall[] = []
  const allToolRecords: StreamResult['toolCallRecords'] = []

  for (let round = 0; round < maxRounds; round++) {
    console.log(`[pi-ai] round ${round + 1}/${maxRounds} start, context messages: ${context.messages.length}`)
    const eventStream = piStream(model, context, streamOptions)
    const roundResult = await processEventStream(eventStream, callbacks, round > 0)
    console.log(`[pi-ai] round ${round + 1} done: stopReason=${roundResult.stopReason} content=${roundResult.content.length}c tools=${roundResult.toolCalls.length}`)

    fullContent = roundResult.content || fullContent
    tokensUsed = roundResult.tokensUsed || tokensUsed
    stopReason = roundResult.stopReason as StreamResult['stopReason']
    allToolCalls.push(...roundResult.toolCalls)

    callbacks?.onRoundEnd?.(round, {
      content: fullContent,
      tokensUsed,
      stopReason,
      toolCalls: roundResult.toolCalls
    })

    if (stopReason !== 'toolUse' || roundResult.toolCalls.length === 0) {
      break
    }

    // 执行工具调用并追加到 context
    context.messages.push({
      role: 'assistant',
      content: roundResult.toolCalls.map(tc => ({
        type: 'toolCall' as const,
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments
      })),
      api: 'openai-completions',
      provider: provider as any,
      model: modelId,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: 'toolUse',
      timestamp: Date.now()
    } as unknown as AssistantMessage)

    // 执行每个工具并将结果追加到 context
    for (const tc of roundResult.toolCalls) {
      console.log(`[pi-ai] executing tool: ${tc.name} args=${JSON.stringify(tc.arguments).slice(0, 100)}`)
      const resultMsg = await executeToolCall(tc)
      context.messages.push(resultMsg)

      const record = {
        ...toolCallToRecord(tc),
        ...toolResultToRecord(resultMsg)
      }
      allToolRecords.push(record)
      console.log(`[pi-ai] tool result: ${tc.name} isError=${resultMsg.isError} content=${(resultMsg.content[0] as any)?.text?.length || 0}c`)
      callbacks?.onToolResult?.(record)
    }

    console.log(`[pi-ai] round ${round + 1} tools executed, continuing to next round`)
  }

  console.log(`[pi-ai] streamChatWithPi done: content=${fullContent.length}c tokens=${tokensUsed} stopReason=${stopReason} toolCalls=${allToolRecords.length}`)
  return {
    content: fullContent,
    tokensUsed,
    stopReason,
    toolCalls: allToolCalls,
    toolCallRecords: allToolRecords
  }
}
