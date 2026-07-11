import { Request, Response } from 'express'
import * as service from '../services/skill-config.service.js'

export function list(_req: Request, res: Response): void {
  res.json(service.listSkills())
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
  const id = Number(req.params.id)
  const content = await service.readSkillFile(id)
  if (content === null) { res.status(404).json({ error: 'Not found' }); return }
  res.json({ content })
}
export async function putFile(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id)
  const ok = await service.writeSkillFile(id, req.body.content || '')
  if (!ok) { res.status(404).json({ error: 'Not found' }); return }
  res.json({ success: true })
}
export async function getEnabled(_req: Request, res: Response): Promise<void> {
  res.json(await service.getEnabledSkills())
}
