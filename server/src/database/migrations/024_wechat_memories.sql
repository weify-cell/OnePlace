-- v2.4 wechat-memories
-- 微信 Bot 长期记忆：每晚整理当天对话抽取的离散记忆条目
CREATE TABLE IF NOT EXISTS wechat_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  memory_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, content)
);
CREATE INDEX IF NOT EXISTS idx_wechat_memories_user_date ON wechat_memories(user_id, memory_date, id);
SELECT '024_wechat_memories done' as status;
