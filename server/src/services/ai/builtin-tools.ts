import { Type } from '@earendil-works/pi-ai'
import { registerTool } from './tools.registry.js'
import { searchKnowledgeBase } from '../knowledge-base.service.js'
import { getNotes, getNoteById } from '../notes.service.js'
import { getFolders } from '../folders.service.js'
import { getTodos, getTodoById, createTodo, updateTodo, deleteTodo } from '../todos.service.js'

/**
 * 注册内置工具，在服务启动时调用
 */
export function registerBuiltinTools(): void {

  // ── 待办任务：查询 ──
  registerTool({
    name: 'search_todos',
    description: '查询待办任务列表，可按状态、优先级、关键词筛选',
    parameters: Type.Object({
      status: Type.Optional(Type.String({ description: '状态筛选: todo/in_progress/done/cancelled' })),
      priority: Type.Optional(Type.String({ description: '优先级筛选: low/medium/high/urgent' })),
      search: Type.Optional(Type.String({ description: '搜索关键词' })),
      limit: Type.Optional(Type.Number({ description: '返回数量，默认 10', default: 10 }))
    })
  }, async (args) => {
    const { items, total } = getTodos({
      status: args.status as string,
      priority: args.priority as string,
      search: args.search as string,
      pageSize: (args.limit as number) || 10
    })
    if (items.length === 0) {
      return { content: '没有待办任务', isError: false }
    }
    const formatted = items.map(t => {
      const priority = { low: '🟢低', medium: '🟡中', high: '🟠高', urgent: '🔴紧急' }[t.priority] || t.priority
      const status = { todo: '⬜待办', in_progress: '🔵进行中', done: '✅已完成', cancelled: '❌已取消' }[t.status] || t.status
      const due = t.due_date ? ` 📅${t.due_date}` : ''
      return `[${t.id}] ${status} ${priority} ${t.title}${due}`
    }).join('\n')
    return { content: `共 ${total} 条待办:\n${formatted}`, isError: false }
  })

  // ── 待办任务：获取详情 ──
  registerTool({
    name: 'get_todo',
    description: '获取指定待办任务的详细信息',
    parameters: Type.Object({
      todo_id: Type.Number({ description: '待办任务 ID' })
    })
  }, async (args) => {
    const todo = getTodoById(args.todo_id as number)
    if (!todo) {
      return { content: `待办任务 ${args.todo_id} 不存在`, isError: true }
    }
    const priority = { low: '低', medium: '中', high: '高', urgent: '紧急' }[todo.priority] || todo.priority
    const status = { todo: '待办', in_progress: '进行中', done: '已完成', cancelled: '已取消' }[todo.status] || todo.status
    return {
      content: `# ${todo.title}\n\n状态: ${status}\n优先级: ${priority}\n${todo.description ? `描述: ${todo.description}\n` : ''}${todo.due_date ? `截止日期: ${todo.due_date}\n` : ''}${todo.tags.length > 0 ? `标签: ${todo.tags.join(', ')}` : ''}`,
      isError: false
    }
  })

  // ── 待办任务：创建 ──
  registerTool({
    name: 'create_todo',
    description: '创建新的待办任务',
    parameters: Type.Object({
      title: Type.String({ description: '任务标题' }),
      description: Type.Optional(Type.String({ description: '任务描述' })),
      priority: Type.Optional(Type.String({ description: '优先级: low/medium/high/urgent，默认 medium' })),
      due_date: Type.Optional(Type.String({ description: '截止日期，格式 YYYY-MM-DD' })),
      reminder_time: Type.Optional(Type.String({ description: '提醒时间，格式 YYYY-MM-DD HH:mm，启用提醒时必须填提醒时间' })),
      reminder_enabled: Type.Optional(Type.Boolean({ description: '是否启用提醒，默认 true' })),
      tags: Type.Optional(Type.Array(Type.String(), { description: '标签列表' }))
    })
  }, async (args) => {
    const todo = createTodo({
      title: args.title as string,
      description: args.description as string,
      priority: (args.priority as any) || 'medium',
      due_date: args.due_date as string,
      reminder_time: args.reminder_time as string,
      reminder_enabled: args.reminder_enabled !== false,
      tags: args.tags as string[]
    })
    return { content: `已创建待办任务: [${todo.id}] ${todo.title}`, isError: false }
  })

  // ── 待办任务：更新 ──
  registerTool({
    name: 'update_todo',
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
    })
  }, async (args) => {
    const todo = updateTodo(args.todo_id as number, {
      status: args.status as any,
      title: args.title as string,
      description: args.description as string,
      priority: args.priority as any,
      due_date: args.due_date as string,
      reminder_time: args.reminder_time as string,
      reminder_enabled: args.reminder_enabled as boolean
    })
    if (!todo) {
      return { content: `待办任务 ${args.todo_id} 不存在`, isError: true }
    }
    return { content: `已更新待办任务: [${todo.id}] ${todo.title}`, isError: false }
  })

  // ── 待办任务：删除 ──
  registerTool({
    name: 'delete_todo',
    description: '删除指定的待办任务',
    parameters: Type.Object({
      todo_id: Type.Number({ description: '待办任务 ID' })
    })
  }, async (args) => {
    const success = deleteTodo(args.todo_id as number)
    if (!success) {
      return { content: `待办任务 ${args.todo_id} 不存在或已删除`, isError: true }
    }
    return { content: `已删除待办任务 ${args.todo_id}`, isError: false }
  })

  // ── 知识库搜索 ──
  registerTool({
    name: 'search_knowledge_base',
    description: '搜索知识库中的笔记文档，返回相关内容片段。用于回答用户关于笔记内容的问题。',
    parameters: Type.Object({
      query: Type.String({ description: '搜索关键词，建议精炼、具体' }),
      limit: Type.Optional(Type.Number({ description: '返回结果数量，默认 5', default: 5 }))
    })
  }, async (args) => {
    const results = await searchKnowledgeBase(args.query as string, (args.limit as number) || 5)
    if (results.length === 0) {
      return { content: '未找到相关笔记', isError: false }
    }
    const formatted = results.map((r, i) =>
      `[${i + 1}] ${r.title} (相关度: ${(r.score * 100).toFixed(0)}%)\n${r.content}`
    ).join('\n\n---\n\n')
    return { content: formatted, isError: false }
  })

  // ── 获取笔记列表 ──
  registerTool({
    name: 'list_notes',
    description: '列出笔记列表，可按文件夹筛选。用于了解用户的笔记概况。',
    parameters: Type.Object({
      folder_id: Type.Optional(Type.Number({ description: '文件夹 ID，不传则列出全部' })),
      limit: Type.Optional(Type.Number({ description: '返回数量，默认 20', default: 20 }))
    })
  }, async (args) => {
    const { items } = getNotes({
      folder_id: args.folder_id as number | undefined,
      page: 1,
      pageSize: (args.limit as number) || 20
    })
    if (items.length === 0) {
      return { content: '没有笔记', isError: false }
    }
    const formatted = items.map((n: any) =>
      `[${n.id}] ${n.title} (${n.is_knowledge_base ? '知识库' : '普通'})`
    ).join('\n')
    return { content: formatted, isError: false }
  })

  // ── 获取笔记详情 ──
  registerTool({
    name: 'get_note',
    description: '获取指定笔记的完整内容',
    parameters: Type.Object({
      note_id: Type.Number({ description: '笔记 ID' })
    })
  }, async (args) => {
    const note = getNoteById(args.note_id as number)
    if (!note) {
      return { content: `笔记 ${args.note_id} 不存在`, isError: true }
    }
    return {
      content: `# ${note.title}\n\n${note.content_text || note.content}`,
      isError: false
    }
  })

  // ── 列出文件夹 ──
  registerTool({
    name: 'list_folders',
    description: '列出所有文件夹',
    parameters: Type.Object({})
  }, async () => {
    const folders = getFolders()
    if (folders.length === 0) {
      return { content: '没有文件夹', isError: false }
    }
    const formatted = folders.map((f: any) => `[${f.id}] ${f.name}`).join('\n')
    return { content: formatted, isError: false }
  })

  console.log(`[tools] builtin tools registered`)
}
