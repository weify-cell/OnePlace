import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function runMigrations(db: Database.Database): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL UNIQUE,
      executed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `)

  const migrationsDir = path.join(__dirname, 'migrations')
  if (!fs.existsSync(migrationsDir)) return

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const executed = new Set(
    (db.prepare('SELECT filename FROM _migrations').all() as { filename: string }[])
      .map(r => r.filename)
  )

  for (const file of files) {
    if (executed.has(file)) continue
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8')
    // 一个文件要么整体生效、要么整体不生效：否则中途失败（比如几条 ALTER 只成了一条）
    // 会留下半成品库、而账本里没记录 —— 之后每次启动都重跑、每次都再失败一次。
    // 迁移里不得出现 BEGIN/COMMIT，也不得写 PRAGMA（那类语句不能在事务里执行）。
    db.exec('BEGIN')
    try {
      db.exec(sql)
      db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw new Error(`Migration failed: ${file}: ${(err as Error).message}`)
    }
    console.log(`Migration executed: ${file}`)
  }
}
