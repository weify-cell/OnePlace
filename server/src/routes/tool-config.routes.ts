import { Router } from 'express'
import * as ctrl from '../controllers/tool-config.controller.js'

export const toolConfigRouter = Router()
toolConfigRouter.get('/list', ctrl.list)
toolConfigRouter.post('/', ctrl.create)
toolConfigRouter.put('/:id', ctrl.update)
toolConfigRouter.delete('/:id', ctrl.remove)
