import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// Project root is 2 levels up from server/src/database/
const PROJECT_ROOT = path.resolve(__dirname, '../../../')

let dbInstance: Database.Database | null = null

export function connectDatabase(): Database.Database {
  if (dbInstance) return dbInstance

  // IMPORTANT: DB_PATH must be computed inside the function, after dotenv loads
  const dbPath = process.env.DB_PATH || './data/oneplace.db'
  const resolvedPath = path.isAbsolute(dbPath) ? dbPath : path.resolve(PROJECT_ROOT, dbPath)

  // Ensure directory exists
  const dir = path.dirname(resolvedPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  dbInstance = new Database(resolvedPath)
  dbInstance.pragma('journal_mode = WAL')
  dbInstance.pragma('foreign_keys = ON')

  return dbInstance
}
