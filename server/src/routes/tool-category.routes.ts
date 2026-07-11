import { Router } from 'express'
import * as ctrl from '../controllers/tool-category.controller.js'
export const toolCategoryRouter = Router()
toolCategoryRouter.get('/list', ctrl.list)
toolCategoryRouter.post('/', ctrl.create)
toolCategoryRouter.put('/:id', ctrl.update)
toolCategoryRouter.delete('/:id', ctrl.remove)
