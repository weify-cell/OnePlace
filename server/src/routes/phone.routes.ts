import { Router } from 'express'
import * as phoneController from '../controllers/phone.controller.js'

export const phoneRouter = Router()

// 手机端上报轨迹点（JWT 鉴权由 /api 上的 authMiddleware 统一负责）
phoneRouter.post('/locations', phoneController.postLocations)
