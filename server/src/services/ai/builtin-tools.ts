import { Type } from '@earendil-works/pi-ai'
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { getNotes, searchNoteLines, getNoteLines } from '../notes.service.js'
import { getTodos, getTodoById, createTodo, updateTodo, updateTodoProgress, getTodoProgressLogs, deleteTodo } from '../todos.service.js'
import { getFolders } from '../folders.service.js'
import { searchKnowledgeBase } from '../knowledge-base.service.js'
import { searchMemories, searchMemoryVectors, addMemory, resolvePrimaryMemoryUser, stripUserIds, isMemoryKind, getMemoryDate } from '../wechat/memory.service.js'
import { listStays, listTrips, resolveRecentDeviceId } from '../phone/track.service.js'
import { getPlace, isFrequentPlace, mostRecentPlace, namePlace } from '../phone/place.service.js'
import { formatBeijingTime, getBeijingDate, getBeijingDateAfter, getBeijingDateTime, getBeijingDayWindow, getBeijingDateTimeSec } from '../../utils/time.js'
import type { StoredStay, StoredTrip } from '../phone/track.service.js'

/** 设备侧时刻（UTC ISO）转成北京钟点 HH:mm，便于机器人转述 */
function beijingClock(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(11, 16)
}

function textResult(text: string): AgentToolResult<undefined> {
  return { content: [{ type: 'text' as const, text }], details: undefined }
}

/**
 * 本回合的工具上下文。
 *
 * 工具的 execute 看不到 agentId 之类的回合信息，凡「这次对话属于谁」这类事实
 * 都必须由调用方显式传进来——不能让模型自己填（记忆归属曾因模型抄错用户 ID
 * 而落到幽灵用户名下）。
 */
export interface ToolContext {
  /** 本回合对话所属的微信用户（记忆读写的归属） */
  memoryUserId?: string
}

export function getBuiltinToolMap(ctx: ToolContext = {}): Map<string, AgentTool> {
  /**
   * 记忆归属：本回合对话的用户优先；单用户部署（Web 对话侧没有微信用户）回退唯一已注册用户。
   * 两者都没有时返回 null——调用方必须拒绝，绝不能退化成「不过滤用户」。
   */
  const resolveMemoryUser = (): string | null => ctx.memoryUserId || resolvePrimaryMemoryUser()

  const tools = [
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
        const type = todo.type ? { work: '工作', study: '学习', personal: '个人', health: '健康', finance: '财务', family: '家庭' }[todo.type] : ''
        const kind = todo.task_kind === 'long_term' ? '长期任务' : '一次性任务'
        const progress = todo.progress_percent != null ? `\n当前进度: ${todo.progress_percent}%` : ''
        // 提醒行为随任务性质不同：一次性提醒一次即关闭，长期每天同一时间重复提醒
        const reminder = todo.reminder_time
          ? `提醒时间: ${todo.reminder_time}${todo.reminder_enabled
            ? (todo.task_kind === 'long_term' ? '（已启用，每天重复提醒）' : '（已启用，仅提醒一次）')
            : '（已关闭）'}\n`
          : ''
        return textResult(`# ${todo.title}\n\n状态: ${status}\n优先级: ${priority}\n类型: ${kind}${type ? ` (${type})` : ''}${progress}\n${todo.description ? `描述: ${todo.description}\n` : ''}${todo.due_date ? `截止日期: ${todo.due_date}\n` : ''}${reminder}${todo.tags.length > 0 ? `标签: ${todo.tags.join(', ')}` : ''}`)
      }
    },

    // ── 6. 创建待办 ──
    {
      name: 'create_todo',
      label: '创建待办',
      description: '创建新的待办任务。任务性质(task_kind)决定提醒行为：一次性(one_time)到点提醒一次后自动关闭；长期(long_term)到点提醒后自动顺延到次日同一时间，每天重复提醒，并支持进度跟踪。当用户说「每天/每日/习惯/坚持/长期」时，应使用 long_term。',
      parameters: Type.Object({
        title: Type.String({ description: '任务标题' }),
        description: Type.Optional(Type.String({ description: '任务描述' })),
        priority: Type.Optional(Type.String({ description: '优先级: low/medium/high/urgent，默认 medium' })),
        task_kind: Type.Optional(Type.String({ description: '任务性质: one_time=一次性（提醒一次后自动关闭，默认）/ long_term=长期（每天同一时间重复提醒 + 可跟踪进度）' })),
        due_date: Type.Optional(Type.String({ description: '截止日期，格式 YYYY-MM-DD' })),
        reminder_time: Type.Optional(Type.String({ description: '提醒时间，格式 YYYY-MM-DD HH:mm，启用提醒时必须填。一次性任务到点提醒一次即关闭；长期任务到点提醒后自动顺延到次日同一时间' })),
        reminder_enabled: Type.Optional(Type.Boolean({ description: '是否启用提醒，默认 true' })),
        tags: Type.Optional(Type.Array(Type.String(), { description: '标签列表' }))
      }),
      execute: async (_toolCallId: string, params: {
        title: string; description?: string; priority?: string; task_kind?: string; due_date?: string;
        reminder_time?: string; reminder_enabled?: boolean; tags?: string[]
      }) => {
        const todo = createTodo({
          title: params.title,
          description: params.description,
          priority: (params.priority || 'medium') as 'low' | 'medium' | 'high' | 'urgent',
          task_kind: params.task_kind as 'one_time' | 'long_term' | undefined,
          due_date: params.due_date,
          reminder_time: params.reminder_time,
          reminder_enabled: params.reminder_enabled !== false,
          tags: params.tags
        })
        const kindHint = todo.task_kind === 'long_term'
          ? '长期任务，将每天同一时间重复提醒'
          : '一次性任务，提醒一次后自动关闭'
        return textResult(`已创建待办任务: [${todo.id}] ${todo.title}（${kindHint}）`)
      }
    },

    // ── 7. 更新待办 ──
    {
      name: 'update_todo',
      label: '更新待办',
      description: '更新待办任务的状态或信息。可通过 task_kind 在「一次性」与「长期」之间转换：改为 long_term 后提醒将每天重复；改为 one_time 后提醒只发一次，且已记录的进度会被清空。',
      parameters: Type.Object({
        todo_id: Type.Number({ description: '待办任务 ID' }),
        status: Type.Optional(Type.String({ description: '新状态: todo/in_progress/done/cancelled' })),
        title: Type.Optional(Type.String({ description: '新标题' })),
        description: Type.Optional(Type.String({ description: '新描述' })),
        priority: Type.Optional(Type.String({ description: '新优先级: low/medium/high/urgent' })),
        task_kind: Type.Optional(Type.String({ description: '任务性质: one_time=一次性（提醒一次后自动关闭）/ long_term=长期（每天同一时间重复提醒 + 可跟踪进度）。改为 one_time 会清空已记录的进度' })),
        due_date: Type.Optional(Type.String({ description: '新截止日期，格式 YYYY-MM-DD' })),
        reminder_time: Type.Optional(Type.String({ description: '新提醒时间，格式 YYYY-MM-DD HH:mm。一次性任务到点提醒一次即关闭；长期任务到点提醒后自动顺延到次日同一时间' })),
        reminder_enabled: Type.Optional(Type.Boolean({ description: '是否启用提醒' }))
      }),
      execute: async (_toolCallId: string, params: {
        todo_id: number; status?: string; title?: string; description?: string;
        priority?: string; task_kind?: string; due_date?: string; reminder_time?: string; reminder_enabled?: boolean
      }) => {
        const todo = updateTodo(params.todo_id, {
          status: params.status as 'todo' | 'in_progress' | 'done' | 'cancelled' | undefined,
          title: params.title,
          description: params.description,
          priority: params.priority as 'low' | 'medium' | 'high' | 'urgent' | undefined,
          task_kind: params.task_kind as 'one_time' | 'long_term' | undefined,
          due_date: params.due_date,
          reminder_time: params.reminder_time,
          reminder_enabled: params.reminder_enabled
        })
        if (!todo) {
          return textResult(`待办任务 ${params.todo_id} 不存在`)
        }
        const kindHint = todo.task_kind === 'long_term'
          ? '长期任务，将每天同一时间重复提醒'
          : '一次性任务，提醒一次后自动关闭'
        return textResult(`已更新待办任务: [${todo.id}] ${todo.title}（${kindHint}）`)
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
      description: '更新长期待办任务的进度百分比和备注。仅 long_term 任务可用；一次性任务调用会报错（需先用 update_todo 改为 long_term）。',
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
      description: '获取长期待办任务的进度更新日志。仅 long_term 任务可用；一次性任务调用会报错。',
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
          const reminder = t.reminder_time ? ` ⏰${t.reminder_time}${t.reminder_enabled ? '' : '(提醒已关)'}` : ''
          const kind = t.task_kind === 'long_term' ? ' 📆长期' : ''
          const prog = t.progress_percent != null ? ` ${t.progress_percent}%` : ''
          return `[${t.id}] ${status} ${priority}${kind} ${t.title}${due}${reminder}${prog}`
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
        // 北京时间由 utils/time.js 统一提供（含星期，便于模型推算相对日期）
        const beijingTime = formatBeijingTime()
        const iso = getBeijingDateTimeSec().replace(' ', 'T')
        return textResult(`当前北京时间: ${beijingTime} (${iso})`)
      }
    },

    // ── 14. 搜索记忆（数据库）──
    {
      name: 'search_memory',
      label: '搜索记忆',
      description: '在微信 Bot 的长期记忆库中按关键词检索，返回相关的记忆条目。用于回忆过往对话中提到的事实、偏好或事件。',
      parameters: Type.Object({
        query: Type.String({ description: '搜索关键词' }),
        limit: Type.Optional(Type.Number({ description: '返回数量，默认 10', default: 10 }))
      }),
      execute: async (_toolCallId: string, params: { query: string; limit?: number }) => {
        const userId = resolveMemoryUser()
        if (!userId) return textResult('无法确定当前用户，暂时无法检索记忆。')
        const rows = searchMemories(params.query, { userId, limit: params.limit })
        if (rows.length === 0) return textResult('未找到相关记忆')
        return textResult(rows.map(r => `- ${r.memory_date.slice(5)}: ${r.content}`).join('\n'))
      }
    },

    // ── 15. 语义搜索记忆（向量）──
    {
      name: 'search_memory_vectors',
      label: '语义搜索记忆',
      description: '在微信 Bot 的长期记忆向量库中按语义相似度检索，返回相关的记忆条目。用于模糊回忆、语义相关的历史信息。',
      parameters: Type.Object({
        query: Type.String({ description: '搜索关键词或描述' }),
        limit: Type.Optional(Type.Number({ description: '返回数量，默认 5', default: 5 }))
      }),
      execute: async (_toolCallId: string, params: { query: string; limit?: number }) => {
        const userId = resolveMemoryUser()
        if (!userId) return textResult('无法确定当前用户，暂时无法检索记忆。')
        const results = await searchMemoryVectors(params.query, { userId, limit: params.limit })
        if (results.length === 0) return textResult('未找到相关记忆')
        return textResult(results.map((r, i) => `[${i + 1}] (相关度: ${(r.score * 100).toFixed(0)}%)\n- ${r.memory_date.slice(5)}: ${r.content}`).join('\n\n---\n\n'))
      }
    },

    // ── 16. 记住记忆（写入）──
    {
      name: 'add_memory',
      label: '记住记忆',
      description: '记住一条长期记忆（含语义向量），重复内容自动忽略。写入时要声明记忆类型：状态型(state)=会被新值取代的当前状态（进度、约定、偏好），必须给主题键 topic；事件型(event)=某天发生了什么，只随时间退场。',
      parameters: Type.Object({
        content: Type.String({ description: '要记住的内容，一句完整、独立、可检索的话' }),
        kind: Type.Optional(Type.String({ description: '记忆类型: state=状态型（会被同主题新值取代）/ event=事件型（随时间退场）' })),
        topic: Type.Optional(Type.String({ description: '状态型的主题键，如「阅读进度:习惯的力量」「习惯:冥想时间」；同键新值会取代旧值。事件型不需要' })),
        memory_date: Type.Optional(Type.String({ description: '记忆归属的北京日期 YYYY-MM-DD，不传则默认今天' }))
      }),
      execute: async (_toolCallId: string, params: { content: string; kind?: string; topic?: string; memory_date?: string }) => {
        // 内容校验只在 addMemory 一处（两条写入路径共用）；这里只把结果翻译成给模型看的话
        const userId = resolveMemoryUser()
        if (!userId) return textResult('无法确定当前用户，暂时无法写入记忆。')
        const memoryDate = params.memory_date || getMemoryDate(new Date())
        const content = params.content || ''
        const res = await addMemory(userId, content, memoryDate, {
          kind: isMemoryKind(params.kind) ? params.kind : undefined,
          topic: params.topic
        })
        if (res.status === 'invalid') return textResult('记忆内容过短或为空，请提供一句完整的话。')
        if (res.status === 'duplicate') return textResult(`已存在同内容记忆，未重复添加：${content.trim()}`)
        const stored = stripUserIds(content.trim(), userId)
        // 只在真的取代了旧值时提一句（没取代却宣称取代，会让模型以为主题键对上了）
        const supersedeNote = res.superseded > 0 ? `（已取代同主题旧值 ${res.superseded} 条）` : ''
        // 写入日期比同主题现有值更旧时（例如整理补跑），那条不会成为当前值——不能只说「已记住」
        const staleNote = res.becameCurrent ? '' : '（同主题已有更新的值，本条未成为当前状态）'
        if (res.status === 'updated') {
          return textResult(`已给已有记忆补上类型与主题：${stored}${supersedeNote}${staleNote}`)
        }
        return textResult(res.vectorOk
          ? `已记住：${stored}${supersedeNote}${staleNote}`
          : `已记住：${stored}${supersedeNote}${staleNote}（向量库写入失败，仅存入数据库）`)
      }
    },

    // ── 17. 查询位置轨迹（手机上报后由服务端切分出的结论）──
    {
      name: 'get_location_history',
      label: '查询位置轨迹',
      description: '读取用户手机轨迹加工后的结论：某段时间内的停留（在哪、待了多久）与行程（起止时刻、里程、时长）。这是用户手机的真实记录，不是推测。',
      parameters: Type.Object({
        date: Type.Optional(Type.String({ description: '北京日期 YYYY-MM-DD，默认今天' })),
        days: Type.Optional(Type.Number({ description: '从该日往前看几天，默认 1（即只看该日）' }))
      }),
      execute: async (_toolCallId: string, params: { date?: string; days?: number }) => {
        const deviceId = resolveRecentDeviceId()
        if (!deviceId) return textResult('还没有任何手机轨迹数据（手机端可能没在采集）。')

        const days = Math.min(Math.max(params.days ?? 1, 1), 30)
        const endDate = params.date || getBeijingDate()
        const startDate = getBeijingDateAfter(-(days - 1), new Date(`${endDate}T00:00:00Z`))
        const from = getBeijingDayWindow(startDate).start
        const to = getBeijingDayWindow(endDate).end

        const stays = listStays(deviceId, { from, to })
        const trips = listTrips(deviceId, { from, to })
        if (stays.length === 0 && trips.length === 0) {
          return textResult(`${startDate} 至 ${endDate} 没有轨迹结论（要么这段时间没出门，要么手机没在采集）。`)
        }

        const range = startDate === endDate ? startDate : `${startDate} 至 ${endDate}`
        const lines: string[] = [`${range}（北京时间）的轨迹结论：`, '']
        if (stays.length > 0) {
          lines.push('停留：')
          for (const s of stays) {
            const minutes = Math.round((Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60000)
            // 有名字就用名字（"家""公司"），没名字给出编号与坐标——编号是命名工具的入参
            const where = s.place_id
              ? (s.place_name ? `${s.place_name}（#${s.place_id}）` : `未命名地点（#${s.place_id}）${s.center_lat.toFixed(4)},${s.center_lon.toFixed(4)} 半径约 ${Math.round(s.radius_m)} m`)
              : `${s.center_lat.toFixed(4)},${s.center_lon.toFixed(4)} 半径约 ${Math.round(s.radius_m)} m`
            lines.push(`- ${beijingClock(s.started_at)}–${beijingClock(s.ended_at)}（${minutes} 分钟）@ ${where}`)
          }
          const unnamedFrequent = [...new Set(stays
            .filter(s => s.place_id && !s.place_name && s.place_hit_count !== null && s.place_day_count !== null
              && isFrequentPlace({ hit_count: s.place_hit_count, day_count: s.place_day_count }))
            .map(s => s.place_id as number))]
          if (unnamedFrequent.length > 0) {
            lines.push(`（其中 ${unnamedFrequent.map(id => `#${id}`).join('、')} 已反复出现，可以用 name_place 命名，例如"把 #${unnamedFrequent[0]} 命名为家"）`)
          }
        }
        if (trips.length > 0) {
          lines.push('行程：')
          for (const t of trips) {
            const minutes = Math.round((Date.parse(t.ended_at) - Date.parse(t.started_at)) / 60000)
            const km = (t.distance_m / 1000).toFixed(1)
            lines.push(`- ${beijingClock(t.started_at)}–${beijingClock(t.ended_at)}（${minutes} 分钟）约 ${km} km`)
          }
        }
        const totalKm = (trips.reduce((sum, t) => sum + t.distance_m, 0) / 1000).toFixed(1)
        lines.push('', `合计：停留 ${stays.length} 处、行程 ${trips.length} 段、里程约 ${totalKm} km`)
        return textResult(lines.join('\n'))
      }
    },

    // ── 18. 给地点命名 ──
    {
      name: 'name_place',
      label: '给地点命名',
      description: '给手机轨迹识别出的地点起个名字（如"家""公司""健身房"），以后就能用名字指代它。地点编号在"查询位置轨迹"的结果里写作 #N。不传编号时，给最近一次停留的那处命名。',
      parameters: Type.Object({
        name: Type.String({ description: '地点的名字，如"家""公司"' }),
        place_id: Type.Optional(Type.Number({ description: '地点编号（#N）；不传则用最近一次停留的那处' }))
      }),
      execute: async (_toolCallId: string, params: { name: string; place_id?: number }) => {
        const deviceId = resolveRecentDeviceId()
        if (!deviceId) return textResult('还没有任何手机轨迹数据，暂时没法命名地点。')
        const target = params.place_id ? getPlace(params.place_id) : mostRecentPlace(deviceId)
        if (!target) return textResult('没找到那个地点（编号可能不对，或还没识别出地点）。')
        if (!namePlace(target.id, params.name)) return textResult('名字不能为空。')
        return textResult(`已命名：#${target.id} → 「${params.name.trim()}」（出现过 ${target.hit_count} 次、${target.day_count} 天）`)
      }
    }
  ] as unknown as AgentTool[]
  return new Map(tools.map(t => [t.name, t]))
}
