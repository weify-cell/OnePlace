import { Router } from 'express'
import * as todosController from '../controllers/todos.controller.js'

export const todosRouter = Router()

todosRouter.get('/tags', todosController.getTodoTags)
todosRouter.get('/counts', todosController.getTodoCounts)
todosRouter.get('/pending-count', todosController.getPendingCount)
todosRouter.get('/urgent-count', todosController.getUrgentCount)
todosRouter.get('/', todosController.getTodos)
todosRouter.post('/', todosController.createTodo)
todosRouter.get('/:id', todosController.getTodo)
todosRouter.patch('/:id', todosController.updateTodo)
todosRouter.delete('/:id', todosController.deleteTodo)
