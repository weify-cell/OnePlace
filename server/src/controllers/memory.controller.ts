import { Request, Response } from 'express'
import { listMemories, resolvePrimaryMemoryUser, type MemoryListFilter } from '../services/wechat/memory.service.js'

const FILTERS: MemoryListFilter[] = ['all', 'state', 'event', 'archived']

/**
 * 记忆列表（只读）。
 *
 * 单用户部署下不传 user_id 就落到唯一注册用户；多用户时必须显式传（不猜）。
 * 这里**没有任何写操作**——本轮只解决「看得见」。
 */
export function getMemories(req: Request, res: Response): void {
  const requested = String(req.query.user_id ?? '') || null
  const userId = requested ?? resolvePrimaryMemoryUser()
  if (!userId) {
    res.status(400).json({ error: '无法确定要查看哪个用户的记忆（多用户部署时请传 user_id）' })
    return
  }

  const filterParam = String(req.query.filter ?? 'all')
  const filter = (FILTERS as string[]).includes(filterParam) ? filterParam as MemoryListFilter : 'all'
  const page = Number(req.query.page ?? 1)
  const pageSize = Number(req.query.pageSize ?? 20)

  const result = listMemories({ userId, filter, page, pageSize })
  res.json({
    ...result,
    filter,
    // 命中次数与汇总比率需要检索事件表（工单 02），未落地前明确说明而不是回 0 假装有数据
    stats_available: false
  })
}
