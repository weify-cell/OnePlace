import { Router } from 'express'
import * as settingsController from '../controllers/settings.controller.js'

export const settingsRouter = Router()

settingsRouter.get('/', settingsController.getAllSettings)
settingsRouter.get('/:key', settingsController.getSetting)
settingsRouter.put('/:key', settingsController.setSetting)
