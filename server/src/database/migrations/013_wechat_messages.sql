-- v1.20 wechat-messages
-- 微信聊天历史持久化
CREATE TABLE IF NOT EXISTS wechat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_wechat_messages_user ON wechat_messages(user_id, created_at);
SELECT '013_wechat_messages done' as status;
