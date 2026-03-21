import { Router } from 'express'
import * as authController from '../controllers/auth.controller.js'

export const authRouter = Router()

authRouter.post('/check', authController.checkSetup)
authRouter.post('/setup', authController.setupPassword)
authRouter.post('/login', authController.login)
