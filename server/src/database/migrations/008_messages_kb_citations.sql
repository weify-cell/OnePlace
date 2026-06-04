-- v1.12 kb-citations
-- 为 messages 表添加知识库引用字段
ALTER TABLE messages ADD COLUMN kb_citations TEXT;
SELECT '008_messages_kb_citations done' as status;