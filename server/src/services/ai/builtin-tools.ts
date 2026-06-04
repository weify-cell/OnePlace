import { Type } from '@earendil-works/pi-ai'
import { registerTool } from './tools.registry.js'
import { searchKnowledgeBase } from '../knowledge-base.service.js'
import { getNotes, getNoteById } from '../notes.service.js'
import { getFolders } from '../folders.service.js'

/**
 * 注册内置工具，在服务启动时调用
 */
export function registerBuiltinTools(): void {

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
