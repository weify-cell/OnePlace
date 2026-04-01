-- v1.8 notes-markdown 数据库变更
-- Migration: server/src/database/migrations/005_notes_content_format.sql

-- notes 表新增字段
ALTER TABLE notes ADD COLUMN content_format TEXT NOT NULL DEFAULT 'tiptap';

-- content_format 取值说明:
--   'tiptap'   = 存量 Tiptap JSON 格式笔记（仅展示，不支持 Markdown 编辑）
--   'markdown' = 新 Markdown 格式笔记（支持 CodeMirror 6 编辑器）
--
-- 存量笔记默认 'tiptap'，新建笔记默认为 'markdown'
