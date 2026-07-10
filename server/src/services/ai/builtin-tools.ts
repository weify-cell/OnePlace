import { Type } from '@earendil-works/pi-ai'
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { getNotes, searchNoteLines, getNoteLines } from '../notes.service.js'
import { getTodos, getTodoById, createTodo, updateTodo, updateTodoProgress, getTodoProgressLogs, deleteTodo } from '../todos.service.js'
import { getFolders } from '../folders.service.js'
import { searchKnowledgeBase } from '../knowledge-base.service.js'

function textResult(text: string): AgentToolResult<undefined> {
  return { content: [{ type: 'text' as const, text }], details: undefined }
}

export function getBuiltinTools(): AgentTool[] {
  return [
    // ── 1. 列出笔记 ──
    {
      name: 'list_notes',
      label: '列出笔记',
      description: '列出笔记列表，可按文件夹筛选。用于了解用户的笔记概况。',
      parameters: Type.Object({
        folder_id: Type.Optional(Type.Number({ description: '文件夹 ID，不传则列出全部' })),
        limit: Type.Optional(Type.Number({ description: '返回数量，默认 20', default: 20 }))
      }),
      execute: async (_toolCallId: string, params: { folder_id?: number; limit?: number }) => {
        const { items } = getNotes({
          folder_id: params.folder_id,
          page: 1,
          pageSize: params.limit || 20
        })
        if (items.length === 0) {
          return textResult('没有笔记')
        }
        const formatted = items.map((n) =>
          `[${n.id}] ${n.title} (${n.is_knowledge_base ? '知识库' : '普通'})`
        ).join('\n')
        return textResult(formatted)
      }
    },

    // ── 2. 搜索笔记行 ──
    {
      name: 'search_note_lines',
      label: '搜索笔记行',
      description: '在指定笔记中搜索关键词，返回匹配行的上下文。',
      parameters: Type.Object({
        note_id: Type.Number({ description: '笔记 ID' }),
        query: Type.String({ description: '搜索关键词' }),
        index: Type.Optional(Type.Number({ description: '匹配项序号，默认 0', default: 0 }))
      }),
      execute: async (_toolCallId: string, params: { note_id: number; query: string; index?: number }) => {
        const result = searchNoteLines(params.note_id, params.query, params.index ?? 0)
        if (result.totalMatches === 0) {
          return textResult('未找到匹配内容')
        }
        if (!result.match) {
          return textResult(`共 ${result.totalMatches} 个匹配，但所选序号无效`)
        }
        const formatted = `笔记: ${result.match.note_title}\n匹配 ${result.selectedIndex + 1}/${result.totalMatches} (行 ${result.match.line})\n\n${result.match.context_text}`
        return textResult(formatted)
      }
    },

    // ── 3. 获取笔记行范围 ──
    {
      name: 'get_note_lines',
      label: '获取笔记行',
      description: '获取指定笔记的行号范围内容。',
      parameters: Type.Object({
        note_id: Type.Number({ description: '笔记 ID' }),
        start_line: Type.Number({ description: '起始行号（从 1 开始）' }),
        end_line: Type.Number({ description: '结束行号' })
      }),
      execute: async (_toolCallId: string, params: { note_id: number; start_line: number; end_line: number }) => {
        const result = getNoteLines(params.note_id, params.start_line, params.end_line)
        const formatted = `笔记: ${result.note_title} (行 ${result.start_line}-${result.end_line} / 共 ${result.total_lines} 行)\n\n${result.content}`
        return textResult(formatted)
      }
    },

    // ── 4. 列出文件夹 ──
    {
      name: 'list_folders',
      label: '列出文件夹',
      description: '列出所有文件夹',
      parameters: Type.Object({}),
      execute: async () => {
        const folders = getFolders()
        if (folders.length === 0) {
          return textResult('没有文件夹')
        }
        const formatted = folders.map((f) => `[${f.id}] ${f.name}`).join('\n')
        return textResult(formatted)
      }
    },

    // ── 5. 获取待办详情 ──
    {
      name: 'get_todo',
      label: '获取待办详情',
      description: '获取指定待办任务的详细信息',
      parameters: Type.Object({
        todo_id: Type.Number({ description: '待办任务 ID' })
      }),
      execute: async (_toolCallId: string, params: { todo_id: number }) => {
        const todo = getTodoById(params.todo_id)
        if (!todo) {
          return textResult(`待办任务 ${params.todo_id} 不存在`)
        }
        const priority = { low: '低', medium: '中', high: '高', urgent: '紧急' }[todo.priority] || todo.priority
        const status = { todo: '待办', in_progress: '进行中', done: '已完成', cancelled: '已取消' }[todo.status] || todo.status
        return textResult(`# ${todo.title}\n\n状态: ${status}\n优先级: ${priority}\n${todo.description ? `描述: ${todo.description}\n` : ''}${todo.due_date ? `截止日期: ${todo.due_date}\n` : ''}${todo.tags.length > 0 ? `标签: ${todo.tags.join(', ')}` : ''}`)
      }
    },

    // ── 6. 创建待办 ──
    {
      name: 'create_todo',
      label: '创建待办',
      description: '创建新的待办任务',
      parameters: Type.Object({
        title: Type.String({ description: '任务标题' }),
        description: Type.Optional(Type.String({ description: '任务描述' })),
        priority: Type.Optional(Type.String({ description: '优先级: low/medium/high/urgent，默认 medium' })),
        due_date: Type.Optional(Type.String({ description: '截止日期，格式 YYYY-MM-DD' })),
        reminder_time: Type.Optional(Type.String({ description: '提醒时间，格式 YYYY-MM-DD HH:mm，启用提醒时必须填提醒时间' })),
        reminder_enabled: Type.Optional(Type.Boolean({ description: '是否启用提醒，默认 true' })),
        tags: Type.Optional(Type.Array(Type.String(), { description: '标签列表' }))
      }),
      execute: async (_toolCallId: string, params: {
        title: string; description?: string; priority?: string; due_date?: string;
        reminder_time?: string; reminder_enabled?: boolean; tags?: string[]
      }) => {
        const todo = createTodo({
          title: params.title,
          description: params.description,
          priority: (params.priority || 'medium') as 'low' | 'medium' | 'high' | 'urgent',
          due_date: params.due_date,
          reminder_time: params.reminder_time,
          reminder_enabled: params.reminder_enabled !== false,
          tags: params.tags
        })
        return textResult(`已创建待办任务: [${todo.id}] ${todo.title}`)
      }
    },

    // ── 7. 更新待办 ──
    {
      name: 'update_todo',
      label: '更新待办',
      description: '更新待办任务的状态或信息',
      parameters: Type.Object({
        todo_id: Type.Number({ description: '待办任务 ID' }),
        status: Type.Optional(Type.String({ description: '新状态: todo/in_progress/done/cancelled' })),
        title: Type.Optional(Type.String({ description: '新标题' })),
        description: Type.Optional(Type.String({ description: '新描述' })),
        priority: Type.Optional(Type.String({ description: '新优先级: low/medium/high/urgent' })),
        due_date: Type.Optional(Type.String({ description: '新截止日期，格式 YYYY-MM-DD' })),
        reminder_time: Type.Optional(Type.String({ description: '新提醒时间，格式 YYYY-MM-DD HH:mm' })),
        reminder_enabled: Type.Optional(Type.Boolean({ description: '是否启用提醒' }))
      }),
      execute: async (_toolCallId: string, params: {
        todo_id: number; status?: string; title?: string; description?: string;
        priority?: string; due_date?: string; reminder_time?: string; reminder_enabled?: boolean
      }) => {
        const todo = updateTodo(params.todo_id, {
          status: params.status as 'todo' | 'in_progress' | 'done' | 'cancelled' | undefined,
          title: params.title,
          description: params.description,
          priority: params.priority as 'low' | 'medium' | 'high' | 'urgent' | undefined,
          due_date: params.due_date,
          reminder_time: params.reminder_time,
          reminder_enabled: params.reminder_enabled
        })
        if (!todo) {
          return textResult(`待办任务 ${params.todo_id} 不存在`)
        }
        return textResult(`已更新待办任务: [${todo.id}] ${todo.title}`)
      }
    },

    // ── 8. 删除待办 ──
    {
      name: 'delete_todo',
      label: '删除待办',
      description: '删除指定的待办任务',
      parameters: Type.Object({
        todo_id: Type.Number({ description: '待办任务 ID' })
      }),
      execute: async (_toolCallId: string, params: { todo_id: number }) => {
        const success = deleteTodo(params.todo_id)
        if (!success) {
          return textResult(`待办任务 ${params.todo_id} 不存在或已删除`)
        }
        return textResult(`已删除待办任务 ${params.todo_id}`)
      }
    },

    // ── 9. 更新待办进度 ──
    {
      name: 'update_todo_progress',
      label: '更新待办进度',
      description: '更新长期待办任务的进度百分比和备注',
      parameters: Type.Object({
        todo_id: Type.Number({ description: '待办任务 ID' }),
        progress_percent: Type.Optional(Type.Number({ description: '进度百分比 0-100' })),
        note: Type.Optional(Type.String({ description: '进度备注' }))
      }),
      execute: async (_toolCallId: string, params: { todo_id: number; progress_percent?: number; note?: string }) => {
        const todo = updateTodoProgress(params.todo_id, {
          progress_percent: params.progress_percent,
          note: params.note
        })
        if (!todo) {
          return textResult(`待办任务 ${params.todo_id} 不存在`)
        }
        return textResult(`已更新待办进度: [${todo.id}] ${todo.title} → ${todo.progress_percent}%`)
      }
    },

    // ── 10. 获取待办进度日志 ──
    {
      name: 'get_todo_progress_logs',
      label: '获取进度日志',
      description: '获取长期待办任务的进度更新日志',
      parameters: Type.Object({
        todo_id: Type.Number({ description: '待办任务 ID' }),
        limit: Type.Optional(Type.Number({ description: '返回数量，默认 10', default: 10 }))
      }),
      execute: async (_toolCallId: string, params: { todo_id: number; limit?: number }) => {
        const logs = getTodoProgressLogs(params.todo_id, params.limit ?? 10)
        if (!logs) {
          return textResult(`待办任务 ${params.todo_id} 不存在`)
        }
        if (logs.length === 0) {
          return textResult('暂无进度日志')
        }
        const formatted = logs.map((log) =>
          `[${log.created_at}] ${log.content}`
        ).join('\n')
        return textResult(formatted)
      }
    },

    // ── 11. 知识库搜索 ──
    {
      name: 'search_knowledge_base',
      label: '搜索知识库',
      description: '搜索知识库中的笔记文档，返回相关内容片段。用于回答用户关于笔记内容的问题。',
      parameters: Type.Object({
        query: Type.String({ description: '搜索关键词，建议精炼、具体' }),
        limit: Type.Optional(Type.Number({ description: '返回结果数量，默认 5', default: 5 }))
      }),
      execute: async (_toolCallId: string, params: { query: string; limit?: number }) => {
        const results = await searchKnowledgeBase(params.query, params.limit || 5)
        if (results.length === 0) {
          return textResult('未找到相关笔记')
        }
        const formatted = results.map((r, i) =>
          `[${i + 1}] ${r.title} (相关度: ${(r.score * 100).toFixed(0)}%)\n${r.content}`
        ).join('\n\n---\n\n')
        return textResult(formatted)
      }
    },

    // ── 12. 查询待办列表 ──
    {
      name: 'get_formatted_todos',
      label: '查询待办',
      description: '查询待办任务列表，可按状态、优先级、关键词筛选',
      parameters: Type.Object({
        status: Type.Optional(Type.String({ description: '状态筛选: todo/in_progress/done/cancelled' })),
        priority: Type.Optional(Type.String({ description: '优先级筛选: low/medium/high/urgent' })),
        search: Type.Optional(Type.String({ description: '搜索关键词' })),
        limit: Type.Optional(Type.Number({ description: '返回数量，默认 10', default: 10 }))
      }),
      execute: async (_toolCallId: string, params: { status?: string; priority?: string; search?: string; limit?: number }) => {
        const { items, total } = getTodos({
          status: params.status,
          priority: params.priority,
          search: params.search,
          pageSize: params.limit || 10
        })
        if (items.length === 0) {
          return textResult('没有待办任务')
        }
        const formatted = items.map(t => {
          const priority = { low: '🟢低', medium: '🟡中', high: '🟠高', urgent: '🔴紧急' }[t.priority] || t.priority
          const status = { todo: '⬜待办', in_progress: '🔵进行中', done: '✅已完成', cancelled: '❌已取消' }[t.status] || t.status
          const due = t.due_date ? ` 📅${t.due_date}` : ''
          return `[${t.id}] ${status} ${priority} ${t.title}${due}`
        }).join('\n')
        return textResult(`共 ${total} 条待办:\n${formatted}`)
      }
    },

    // ── 13. 获取当前时间 ──
    {
      name: 'get_current_time',
      label: '获取当前时间',
      parameters: Type.Object({}),
      execute: async () => {
        const now = new Date()
        const beijingTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
        const iso = now.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(' ', 'T')
        return textResult(`当前北京时间: ${beijingTime} (${iso})`)
      }
    }
  ] as unknown as AgentTool[]
}
