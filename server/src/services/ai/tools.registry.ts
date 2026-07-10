import type { Tool, ToolCall, ToolResultMessage, TextContent } from '@earendil-works/pi-ai'
import type { AgentTool } from '@earendil-works/pi-agent-core'

// ── 类型 ──

/** 旧式工具执行结果（保留以兼容现有调用方） */
export interface ToolResult {
  content: string
  isError: boolean
}

// ── 注册表 ──

const toolRegistry = new Map<string, AgentTool>()

/**
 * 注册 AgentTool 数组
 */
export function registerAgentTools(tools: AgentTool[]): void {
  for (const tool of tools) {
    toolRegistry.set(tool.name, tool)
    console.log(`[tools] registered: ${tool.name}`)
  }
}

/**
 * 获取所有工具定义（传给 pi-ai Context.tools）
 */
export function getToolDefinitions(): Tool[] {
  return Array.from(toolRegistry.values()).map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters
  }))
}

/**
 * 执行工具调用
 */
export async function executeToolCall(
  toolCall: ToolCall
): Promise<ToolResultMessage> {
  const tool = toolRegistry.get(toolCall.name)

  if (!tool) {
    return {
      role: 'toolResult',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: [{ type: 'text' as const, text: `Unknown tool: ${toolCall.name}` }],
      isError: true,
      timestamp: Date.now()
    }
  }

  try {
    const result = await tool.execute(toolCall.id, toolCall.arguments)
    const text = result.content
      .filter((c): c is TextContent => c.type === 'text')
      .map(c => c.text)
      .join('\n')
    return {
      role: 'toolResult',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: [{ type: 'text' as const, text }],
      isError: false,
      timestamp: Date.now()
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Tool execution failed'
    console.error(`[tools] ${toolCall.name} failed:`, errMsg)
    return {
      role: 'toolResult',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: [{ type: 'text' as const, text: `Error: ${errMsg}` }],
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
  const textContent = result.content.find(c => c.type === 'text')
  return {
    id: result.toolCallId,
    name: result.toolName,
    result: textContent && 'text' in textContent ? textContent.text : '',
    isError: result.isError
  }
}

/**
 * 将 ToolCall 转为可序列化的记录（用于持久化）
 */
export function toolCallToRecord(toolCall: ToolCall): {
  id: string
  name: string
  arguments: Record<string, unknown>
} {
  return {
    id: toolCall.id,
    name: toolCall.name,
    arguments: toolCall.arguments
  }
}
