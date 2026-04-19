import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load .env from project root (2 levels up from server/src/)
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../.env') })

import express from 'express'
import cors from 'cors'
import { connectDatabase } from './database/index.js'
import { runMigrations } from './database/migrate.js'
import { errorMiddleware } from './middleware/error.middleware.js'
import { authMiddleware } from './middleware/auth.middleware.js'
import { authRouter } from './routes/auth.routes.js'
import { todosRouter } from './routes/todos.routes.js'
import { notesRouter } from './routes/notes.routes.js'
import { chatRouter } from './routes/chat.routes.js'
import { settingsRouter } from './routes/settings.routes.js'
import { foldersRouter } from './routes/folders.routes.js'
import { uploadRouter } from './routes/upload.routes.js'
import { knowledgeBaseRouter } from './routes/knowledge-base.routes.js'

const app = express()
const PORT = process.env.PORT || 3000
const isProduction = process.env.NODE_ENV === 'production'

// CORS: 生产环境允许所有来源（同域部署），开发环境限制 localhost
app.use(cors(isProduction ? { origin: true, credentials: true } : { origin: ['http://localhost:5173', 'http://localhost:4173'] }))
app.use(express.json())

// Health check (no auth required)
app.get('/api/health', (req, res) => {
  try {
    const db = connectDatabase()
    db.prepare('SELECT 1').get()
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() })
  } catch {
    res.status(500).json({ status: 'error', db: 'disconnected' })
  }
})

// Auth routes (no auth middleware)
app.use('/api/auth', authRouter)

// Protected routes
app.use('/api', authMiddleware)
app.use('/api/todos', todosRouter)
app.use('/api/notes', notesRouter)
app.use('/api/conversations', chatRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/folders', foldersRouter)
app.use('/api/upload', uploadRouter)
app.use('/api/knowledge-base', knowledgeBaseRouter)

// Static file serving for uploads
const uploadsPath = resolve(__dirname, '../../uploads')
app.use('/uploads', express.static(uploadsPath))

// 生产环境：提供静态文件服务
if (isProduction) {
  const distPath = resolve(__dirname, '../../dist')
  console.log(`[Production] Serving static files from: ${distPath}`)

  // 静态文件服务
  app.use(express.static(distPath))

  // SPA 支持：所有非 API 路由返回 index.html
  app.get('*', (req, res) => {
    res.sendFile(resolve(distPath, 'index.html'))
  })
}

app.use(errorMiddleware)

// Global error handlers to prevent server crashes
process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err.message)
})

process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason)
})

// Initialize DB and start server
const db = connectDatabase()
runMigrations(db)

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`OnePlace server running on http://0.0.0.0:${PORT}`)
  console.log(`Environment: ${isProduction ? 'production' : 'development'}`)
})
