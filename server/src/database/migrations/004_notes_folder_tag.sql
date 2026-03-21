-- 新建文件夹表（软删除，与项目规范一致）
CREATE TABLE IF NOT EXISTS folders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- notes 新增 folder_id 外键（tags 列已在 001_initial_schema.sql 中存在，无需重复添加）
ALTER TABLE notes ADD COLUMN folder_id INTEGER DEFAULT NULL;

-- 索引
CREATE INDEX IF NOT EXISTS idx_notes_folder   ON notes(folder_id)   WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_folders_active ON folders(is_deleted);
