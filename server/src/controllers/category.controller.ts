import { Request, RequestHandler, Response } from 'express'
import {
  type CategoryKind,
  createCategory,
  deleteCategory,
  describeDeleteRefusal,
  listCategories,
  updateCategory
} from '../services/category.service.js'

/**
 * 分类处理器工厂。
 *
 * 工具分类与技能分类的控制器此前是两份逐字重复的实现（含完全相同的 409 分支），
 * 差异只有 CategoryKind。因此用工厂生成；新增一种分类只需一行接线。
 */
export function createCategoryHandlers(kind: CategoryKind): {
  list: RequestHandler
  create: RequestHandler
  update: RequestHandler
  remove: RequestHandler
} {
  return {
    list(_req: Request, res: Response): void {
      res.json(listCategories(kind))
    },

    create(req: Request, res: Response): void {
      res.status(201).json(createCategory(kind, req.body))
    },

    update(req: Request, res: Response): void {
      const updated = updateCategory(kind, Number(req.params.id), req.body)
      if (!updated) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      res.json(updated)
    },

    remove(req: Request, res: Response): void {
      const result = deleteCategory(kind, Number(req.params.id))

      if (result.ok) {
        res.status(204).end()
        return
      }
      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'Not found' })
        return
      }
      // 有子项：返回 409 与可读原因（此前这里是裸的外键约束错误）
      res.status(409).json({
        error: 'HasChildren',
        message: describeDeleteRefusal(kind, result.name, result.itemCount)
      })
    }
  }
}
