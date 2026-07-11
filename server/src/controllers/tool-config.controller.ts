import { Request, Response } from 'express'
import * as service from '../services/tool-config.service.js'

export function list(_req: Request, res: Response): void {
  res.json(service.listTools())
}
export function create(req: Request, res: Response): void {
  res.status(201).json(service.createTool(req.body))
}
export function update(req: Request, res: Response): void {
  const id = Number(req.params.id)
  const result = service.updateTool(id, req.body)
  if (!result) { res.status(404).json({ error: 'Not found' }); return }
  res.json(result)
}
export function remove(req: Request, res: Response): void {
  const id = Number(req.params.id)
  if (!service.deleteTool(id)) { res.status(404).json({ error: 'Not found' }); return }
  res.status(204).end()
}
