import { Router } from 'express'
import * as notesController from '../controllers/notes.controller.js'

export const notesRouter = Router()

notesRouter.get('/tags', notesController.getNoteTags)
notesRouter.get('/', notesController.getNotes)
notesRouter.post('/', notesController.createNote)
notesRouter.get('/:id', notesController.getNote)
notesRouter.patch('/:id', notesController.updateNote)
notesRouter.delete('/:id', notesController.deleteNote)
notesRouter.patch('/:id/pin', notesController.pinNote)
notesRouter.patch('/:id/archive', notesController.archiveNote)
