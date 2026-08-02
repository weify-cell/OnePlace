import { Router } from 'express'
import * as ilinkController from '../controllers/ilink.controller.js'

export const ilinkRouter = Router()

// 状态和配置
ilinkRouter.get('/status', ilinkController.getStatus)
ilinkRouter.get('/config', ilinkController.getConfig)
ilinkRouter.put('/config', ilinkController.updateConfig)

// 学习模式
ilinkRouter.get('/learning-mode', ilinkController.getLearningModeStatus)

// 登录状态
ilinkRouter.get('/login/status', ilinkController.getLoginStatus)
ilinkRouter.post('/login/reset', ilinkController.resetLogin)

// Bot 控制
ilinkRouter.post('/start', ilinkController.startBot)
ilinkRouter.post('/stop', ilinkController.stopBot)

// 提醒服务
ilinkRouter.get('/reminder/status', ilinkController.getReminderStatus)
ilinkRouter.post('/reminder/trigger', ilinkController.triggerReminder)
ilinkRouter.post('/reminder/clear', ilinkController.clearRemindedTodos)

// 消息历史（调试）
ilinkRouter.get('/history/:userId', ilinkController.getMessageHistory)
ilinkRouter.delete('/history/:userId', ilinkController.clearMessageHistory)

// 主动聊天配置
ilinkRouter.get('/proactive-chat/config', ilinkController.getProactiveChatConfig)
ilinkRouter.put('/proactive-chat/config', ilinkController.updateProactiveChatConfig)

// 报告查询 / 编辑 / 删除
ilinkRouter.get('/reports', ilinkController.getReports)
ilinkRouter.get('/reports/:id', ilinkController.getReport)
ilinkRouter.put('/reports/:id', ilinkController.updateReport)
ilinkRouter.delete('/reports/:id', ilinkController.deleteReport)
