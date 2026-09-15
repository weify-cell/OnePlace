import { Request, Response } from 'express'
import {
  TOOL_CATEGORY,
  createCategory,
  deleteCategory,
  describeDeleteRefusal,
  listCategories,
  updateCategory
} from '../services/category.service.js'

export function list(_: Request, res: Response): void {
  res.json(listCategories(TOOL_CATEGORY))
}

export function create(req: Request, res: Response): void {
  res.status(201).json(createCategory(TOOL_CATEGORY, req.body))
}

export function update(req: Request, res: Response): void {
  const updated = updateCategory(TOOL_CATEGORY, Number(req.params.id), req.body)
  if (!updated) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(updated)
}

export function remove(req: Request, res: Response): void {
  const result = deleteCategory(TOOL_CATEGORY, Number(req.params.id))

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
    message: describeDeleteRefusal(TOOL_CATEGORY, result.name, result.itemCount)
  })
}
