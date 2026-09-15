import { Router } from 'express'
import { createCategoryHandlers } from '../controllers/category.controller.js'
import { TOOL_CATEGORY } from '../services/category.service.js'

export const toolCategoryRouter = Router()
const ctrl = createCategoryHandlers(TOOL_CATEGORY)
toolCategoryRouter.get('/list', ctrl.list)
toolCategoryRouter.post('/', ctrl.create)
toolCategoryRouter.put('/:id', ctrl.update)
toolCategoryRouter.delete('/:id', ctrl.remove)
