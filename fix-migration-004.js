const Database = require('/soft/oneplace/server/node_modules/better-sqlite3');
const db = Database('/soft/oneplace/data/oneplace.db');

try {
  // 创建 folders 表（如果不存在）
  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `);
  console.log('folders table created or exists');

  // 尝试添加 folder_id 列（如果出错则忽略）
  try {
    db.exec('ALTER TABLE notes ADD COLUMN folder_id INTEGER DEFAULT NULL');
    console.log('folder_id column added');
  } catch (e) {
    if (e.message.includes('duplicate column name')) {
      console.log('folder_id column already exists, skipping');
    } else {
      throw e;
    }
  }

  // 创建索引（如果不存在）
  db.exec('CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id) WHERE is_deleted = 0');
  db.exec('CREATE INDEX IF NOT EXISTS idx_folders_active ON folders(is_deleted)');
  console.log('indexes created');

  // 插入迁移记录
  db.prepare("INSERT OR IGNORE INTO _migrations (filename) VALUES (?)").run('004_notes_folder_tag.sql');
  console.log('migration record inserted');

  console.log('Migration 004 applied successfully');
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
}

db.close();
