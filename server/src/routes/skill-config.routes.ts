import { Router } from 'express'
import * as ctrl from '../controllers/skill-config.controller.js'

export const skillConfigRouter = Router()
skillConfigRouter.get('/enabled', ctrl.getEnabled)
skillConfigRouter.get('/list', ctrl.list)
skillConfigRouter.get('/:id/file', ctrl.getFile)
skillConfigRouter.put('/:id/file', ctrl.putFile)
skillConfigRouter.post('/', ctrl.create)
skillConfigRouter.put('/:id', ctrl.update)
skillConfigRouter.delete('/:id', ctrl.remove)
