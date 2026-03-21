CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_todos_priority ON todos(priority) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_todos_type ON todos(type) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_todos_created ON todos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(is_pinned) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC) WHERE is_deleted = 0;
