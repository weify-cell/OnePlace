-- v1.11 kb-enabled
-- 新增知识库相关字段：对话启用知识库开关、笔记知识库标记
ALTER TABLE conversations ADD COLUMN kb_enabled INTEGER DEFAULT 0;
ALTER TABLE notes ADD COLUMN is_knowledge_base INTEGER DEFAULT 0;