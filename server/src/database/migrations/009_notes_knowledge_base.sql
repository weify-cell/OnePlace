-- v1.10 knowledge base integration
-- 新增 is_knowledge_base 字段，标记笔记是否来自知识库
ALTER TABLE notes ADD COLUMN is_knowledge_base INTEGER DEFAULT 0;