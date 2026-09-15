import { Request, Response } from 'express'
import {
  SKILL_CATEGORY,
  createCategory,
  deleteCategory,
  describeDeleteRefusal,
  listCategories,
  updateCategory
} from '../services/category.service.js'

export function list(_: Request, res: Response): void {
  res.json(listCategories(SKILL_CATEGORY))
}

export function create(req: Request, res: Response): void {
  res.status(201).json(createCategory(SKILL_CATEGORY, req.body))
}

export function update(req: Request, res: Response): void {
  const updated = updateCategory(SKILL_CATEGORY, Number(req.params.id), req.body)
  if (!updated) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.json(updated)
}

export function remove(req: Request, res: Response): void {
  const result = deleteCategory(SKILL_CATEGORY, Number(req.params.id))

  if (result.ok) {
    res.status(204).end()
    return
  }
  if (result.reason === 'not_found') {
    res.status(404).json({ error: 'Not found' })
    return
  }
  res.status(409).json({
    error: 'HasChildren',
    message: describeDeleteRefusal(SKILL_CATEGORY, result.name, result.itemCount)
  })
}
