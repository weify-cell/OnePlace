import { Router } from 'express'
import * as memoryController from '../controllers/memory.controller.js'

export const memoryRouter = Router()

// 只读：本轮不提供任何写操作（编辑/删除/手工归档都不做）
memoryRouter.get('/', memoryController.getMemories)
