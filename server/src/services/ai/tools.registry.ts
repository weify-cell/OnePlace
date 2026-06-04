import type { Tool, ToolCall, ToolResultMessage, TextContent } from '@earendil-works/pi-ai'

// 工具执行结果
export interface ToolResult {
  content: string
  isError: boolean
}

// 工具执行器类型
export type ToolExecutor = (args: Record<string, any>) => Promise<ToolResult>

// 工具注册项
interface ToolEntry {
  definition: Tool
  executor: ToolExecutor
}

// 工具注册表：name → { definition, executor }
const toolRegistry = new Map<string, ToolEntry>()

/**
 * 注册工具
 */
export function registerTool(definition: Tool, executor: ToolExecutor): void {
  toolRegistry.set(definition.name, { definition, executor })
  console.log(`[tools] registered: ${definition.name}`)
}

/**
 * 获取所有工具定义（传给 pi-ai Context.tools）
 */
export function getToolDefinitions(): Tool[] {
  return Array.from(toolRegistry.values()).map(e => e.definition)
}

/**
 * 执行工具调用
 */
export async function executeToolCall(
  toolCall: ToolCall
): Promise<ToolResultMessage> {
  const entry = toolRegistry.get(toolCall.name)

  if (!entry) {
    return {
      role: 'toolResult',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: [{ type: 'text', text: `Unknown tool: ${toolCall.name}` } as TextContent],
      isError: true,
      timestamp: Date.now()
    }
  }

  try {
    const result = await entry.executor(toolCall.arguments)
    return {
      role: 'toolResult',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: [{ type: 'text', text: result.content } as TextContent],
      isError: result.isError,
      timestamp: Date.now()
    }
  } catch (err) {
    const errMsg = (err as Error).message || 'Tool execution failed'
    console.error(`[tools] ${toolCall.name} failed:`, errMsg)
    return {
      role: 'toolResult',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: [{ type: 'text', text: `Error: ${errMsg}` } as TextContent],
      isError: true,
      timestamp: Date.now()
    }
  }
}

/**
 * 将 ToolResultMessage 转为可序列化的记录（用于持久化）
 */
export function toolResultToRecord(result: ToolResultMessage): {
  id: string
  name: string
  result: string
  isError: boolean
} {
  const textContent = result.content.find(c => c.type === 'text') as TextContent | undefined
  return {
    id: result.toolCallId,
    name: result.toolName,
    result: textContent?.text || '',
    isError: result.isError
  }
}

/**
 * 将 ToolCall 转为可序列化的记录（用于持久化）
 */
export function toolCallToRecord(toolCall: ToolCall): {
  id: string
  name: string
  arguments: Record<string, any>
} {
  return {
    id: toolCall.id,
    name: toolCall.name,
    arguments: toolCall.arguments
  }
}
