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

const app = express()
const PORT = process.env.PORT || 3000

app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }))
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

app.use(errorMiddleware)

// Initialize DB and start server
const db = connectDatabase()
runMigrations(db)

app.listen(PORT, () => {
  console.log(`OnePlace server running on http://localhost:${PORT}`)
})
