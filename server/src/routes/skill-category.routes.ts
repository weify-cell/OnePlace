import { Router } from 'express'
import * as ctrl from '../controllers/skill-category.controller.js'
export const skillCategoryRouter = Router()
skillCategoryRouter.get('/list', ctrl.list)
skillCategoryRouter.post('/', ctrl.create)
skillCategoryRouter.put('/:id', ctrl.update)
skillCategoryRouter.delete('/:id', ctrl.remove)
