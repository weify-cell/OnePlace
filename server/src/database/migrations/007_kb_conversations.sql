-- v1.11 knowledge-base
-- conversations 表新增知识库开关和检索范围
ALTER TABLE conversations ADD COLUMN kb_enabled INTEGER DEFAULT 0;
ALTER TABLE conversations ADD COLUMN kb_scope TEXT DEFAULT 'all';
