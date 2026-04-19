import { Request, Response } from 'express'
import * as notesService from '../services/notes.service.js'
import * as uploadService from '../services/upload.service.js'

export function getNotes(req: Request, res: Response): void {
  const { tag, search, is_archived, is_pinned, page, pageSize, folder_id,is_knowledge_base } = req.query

  let parsedFolderId: number | 'none' | undefined
  if (folder_id === 'none') {
    parsedFolderId = 'none'
  } else if (folder_id !== undefined && folder_id !== '') {
    parsedFolderId = Number(folder_id)
  }

  const result = notesService.getNotes({
    tag: tag as string,
    search: search as string,
    folder_id: parsedFolderId,
    is_archived: is_archived === 'true',
    is_pinned: is_pinned !== undefined ? is_pinned === 'true' : undefined,
    is_knowledge_base: is_knowledge_base === 'true',
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
  const { folder_id } = req.body
  const note = notesService.createNote({ folder_id: folder_id ?? null })
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


export function isKnowledgeBaseNote(req: Request, res: Response): void {
  const note = notesService.updateNote(Number(req.params.id), { is_knowledge_base: req.body.is_knowledge_base })
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

export function getNoteImages(req: Request, res: Response): void {
  const noteId = Number(req.params.id)
  const note = notesService.getNoteById(noteId)

  if (!note) {
    res.status(404).json({ error: 'NotFound' })
    return
  }

  const images = uploadService.getNoteImages(noteId, note.content)
  res.json({ images })
}
