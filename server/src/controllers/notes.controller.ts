import { Request, Response } from 'express'
import * as notesService from '../services/notes.service.js'

export function getNotes(req: Request, res: Response): void {
  const { tag, search, is_archived, is_pinned, page, pageSize } = req.query
  const result = notesService.getNotes({
    tag: tag as string,
    search: search as string,
    is_archived: is_archived === 'true',
    is_pinned: is_pinned !== undefined ? is_pinned === 'true' : undefined,
    page: page ? Number(page) : 1,
    pageSize: pageSize ? Number(pageSize) : 20
  })
  res.json(result)
}

export function getNote(req: Request, res: Response): void {
  const note = notesService.getNoteById(Number(req.params.id))
  if (!note) { res.status(404).json({ error: 'NotFound' }); return }
  res.json(note)
}

export function createNote(req: Request, res: Response): void {
  const note = notesService.createNote()
  res.status(201).json(note)
}

export function updateNote(req: Request, res: Response): void {
  const note = notesService.updateNote(Number(req.params.id), req.body)
  if (!note) { res.status(404).json({ error: 'NotFound' }); return }
  res.json(note)
}

export function deleteNote(req: Request, res: Response): void {
  const deleted = notesService.deleteNote(Number(req.params.id))
  if (!deleted) { res.status(404).json({ error: 'NotFound' }); return }
  res.status(204).send()
}

export function pinNote(req: Request, res: Response): void {
  const note = notesService.updateNote(Number(req.params.id), { is_pinned: req.body.is_pinned })
  if (!note) { res.status(404).json({ error: 'NotFound' }); return }
  res.json(note)
}

export function archiveNote(req: Request, res: Response): void {
  const note = notesService.updateNote(Number(req.params.id), { is_archived: req.body.is_archived })
  if (!note) { res.status(404).json({ error: 'NotFound' }); return }
  res.json(note)
}

export function getNoteTags(req: Request, res: Response): void {
  res.json(notesService.getAllNoteTags())
}
