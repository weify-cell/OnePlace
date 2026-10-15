import { Router } from 'express'
import * as phoneController from '../controllers/phone.controller.js'

export const phoneRouter = Router()

// 手机端上报轨迹点（JWT 鉴权由 /api 上的 authMiddleware 统一负责）
phoneRouter.post('/locations', phoneController.postLocations)

// 区域（家/公司）：地图页读改这几条
phoneRouter.get('/places', phoneController.getPlaces)
phoneRouter.post('/places', phoneController.postPlace)
phoneRouter.patch('/places/:id', phoneController.patchPlace)
