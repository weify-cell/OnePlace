import { Request, Response } from 'express'
import * as svc from '../services/skill-category.service.js'
export function list(_: Request, res: Response) { res.json(svc.listCategories()) }
export function create(req: Request, res: Response) { res.status(201).json(svc.createCategory(req.body)) }
export function update(req: Request, res: Response) {
  const r = svc.updateCategory(Number(req.params.id), req.body)
  if (!r) { res.status(404).json({ error: 'Not found' }); return }
  res.json(r)
}
export function remove(req: Request, res: Response) {
  if (!svc.deleteCategory(Number(req.params.id))) { res.status(404).json({ error: 'Not found' }); return }
  res.status(204).end()
}
