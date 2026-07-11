import { Request, Response } from 'express'
import * as service from '../services/skill-config.service.js'

export function list(req: Request, res: Response): void {
  const categoryId = req.query.category_id ? Number(req.query.category_id) : undefined
  res.json(service.listSkills(categoryId))
}
export function create(req: Request, res: Response): void {
  res.status(201).json(service.createSkill(req.body))
}
export function update(req: Request, res: Response): void {
  const id = Number(req.params.id)
  const result = service.updateSkill(id, req.body)
  if (!result) { res.status(404).json({ error: 'Not found' }); return }
  res.json(result)
}
export function remove(req: Request, res: Response): void {
  const id = Number(req.params.id)
  if (!service.deleteSkill(id)) { res.status(404).json({ error: 'Not found' }); return }
  res.status(204).end()
}
export async function getFile(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id)
    const content = await service.readSkillFile(id)
    if (content === null) { res.status(404).json({ error: 'Not found' }); return }
    res.json({ content })
  } catch (error) {
    res.status(500).json({ error: 'InternalServerError', message: (error as Error).message })
  }
}
export async function putFile(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id)
    const ok = await service.writeSkillFile(id, req.body.content || '')
    if (!ok) { res.status(404).json({ error: 'Not found' }); return }
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'InternalServerError', message: (error as Error).message })
  }
}
export async function getEnabled(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await service.getEnabledSkills())
  } catch (error) {
    res.status(500).json({ error: 'InternalServerError', message: (error as Error).message })
  }
}
