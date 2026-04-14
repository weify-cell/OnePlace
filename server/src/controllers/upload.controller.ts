import { Request, Response } from 'express'
import path from 'path'
import { connectDatabase } from '../database/index.js'
import * as uploadService from '../services/upload.service.js'
import * as notesService from '../services/notes.service.js'

export function uploadImage(req: Request, res: Response): void {
  if (!req.file) {
    res.status(400).json({ error: 'No file provided' })
    return
  }

  try {
    const result = uploadService.saveUploadedFile(req.file)
    res.json({ url: result.url })
  } catch {
    res.status(500).json({ error: 'Upload failed' })
  }
}

export function deleteImage(req: Request, res: Response): void {
  const filename = req.params.filename as string

  // Security: prevent path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    res.status(400).json({ error: 'Invalid filename' })
    return
  }

  const deleted = uploadService.deleteFile(filename)
  if (!deleted) {
    res.status(404).json({ error: 'File not found' })
    return
  }

  res.status(204).send()
}

export function uploadNoteFile(req: Request, res: Response): void {
  if (!req.file) {
    res.status(400).json({ error: 'No file provided' })
    return
  }

  const ext = path.extname(req.file.originalname).toLowerCase()
  if (ext !== '.txt' && ext !== '.md') {
    res.status(400).json({ error: 'Only .txt and .md files are supported' })
    return
  }

  try {
    const content = req.file.buffer.toString('utf-8')
    const title = path.basename(req.file.originalname, ext) || '无标题'
    const folder_id = req.body.folder_id ? Number(req.body.folder_id) : null

    const db = connectDatabase()
    const result = db.prepare(
      `INSERT INTO notes (title, content, content_text, tags, folder_id, content_format) VALUES (?, ?, ?, '[]', ?, 'markdown')`
    ).run(title, content, content, folder_id)

    const note = notesService.getNoteById(result.lastInsertRowid as number)
    res.status(201).json(note)
  } catch {
    res.status(500).json({ error: 'Failed to create note' })
  }
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
