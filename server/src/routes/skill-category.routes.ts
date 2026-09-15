import { Router } from 'express'
import { createCategoryHandlers } from '../controllers/category.controller.js'
import { SKILL_CATEGORY } from '../services/category.service.js'

export const skillCategoryRouter = Router()
const ctrl = createCategoryHandlers(SKILL_CATEGORY)
skillCategoryRouter.get('/list', ctrl.list)
skillCategoryRouter.post('/', ctrl.create)
skillCategoryRouter.put('/:id', ctrl.update)
skillCategoryRouter.delete('/:id', ctrl.remove)
