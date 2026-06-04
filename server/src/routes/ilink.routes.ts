import { Router } from 'express'
import * as ilinkController from '../controllers/ilink.controller.js'

export const ilinkRouter = Router()

// 状态和配置
ilinkRouter.get('/status', ilinkController.getStatus)
ilinkRouter.get('/config', ilinkController.getConfig)
ilinkRouter.put('/config', ilinkController.updateConfig)

// Bot 控制
ilinkRouter.post('/start', ilinkController.startBot)
ilinkRouter.post('/stop', ilinkController.stopBot)

// 消息历史（调试）
ilinkRouter.get('/history/:userId', ilinkController.getMessageHistory)
ilinkRouter.delete('/history/:userId', ilinkController.clearMessageHistory)
