import { Request, Response } from 'express'
import * as foldersService from '../services/folders.service.js'

export function getFolders(req: Request, res: Response): void {
  const items = foldersService.getFolders()
  res.json({ items })
}

export function createFolder(req: Request, res: Response): void {
  const { name } = req.body
  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ error: 'name is required' })
    return
  }
  const folder = foldersService.createFolder(name.trim())
  res.status(201).json(folder)
}

export function renameFolder(req: Request, res: Response): void {
  const { name } = req.body
  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ error: 'name is required' })
    return
  }
  const folder = foldersService.renameFolder(Number(req.params.id), name.trim())
  if (!folder) { res.status(404).json({ error: 'NotFound' }); return }
  res.json(folder)
}

export function deleteFolder(req: Request, res: Response): void {
  const deleted = foldersService.deleteFolder(Number(req.params.id))
  if (!deleted) { res.status(404).json({ error: 'NotFound' }); return }
  res.json({ ok: true })
}
