-- v1.8 notes-markdown
-- 新增 content_format 字段，标识笔记内容格式
-- 'tiptap' = 存量 Tiptap JSON 格式（仅展示）
-- 'markdown' = 新 Markdown 格式
ALTER TABLE notes ADD COLUMN content_format TEXT NOT NULL DEFAULT 'tiptap';
