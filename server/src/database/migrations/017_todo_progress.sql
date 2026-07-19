ALTER TABLE todos
ADD COLUMN progress_percent INTEGER DEFAULT NULL;

ALTER TABLE todos
ADD COLUMN last_progress_note TEXT DEFAULT NULL;

CREATE TABLE IF NOT EXISTS todo_progress_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_todo_progress_logs_todo_id_created_at
ON todo_progress_logs(todo_id, created_at DESC);

SELECT '017_todo_progress done' as status;
