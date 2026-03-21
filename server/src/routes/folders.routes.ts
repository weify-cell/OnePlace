import { Router } from 'express'
import * as foldersController from '../controllers/folders.controller.js'

export const foldersRouter = Router()

foldersRouter.get('/', foldersController.getFolders)
foldersRouter.post('/', foldersController.createFolder)
foldersRouter.patch('/:id', foldersController.renameFolder)
foldersRouter.delete('/:id', foldersController.deleteFolder)
