-- v1.10 knowledge base integration
-- 新增 is_knowledge_base 字段，标记任务是否来自知识库
ALTER TABLE todos ADD COLUMN is_knowledge_base INTEGER DEFAULT 0;