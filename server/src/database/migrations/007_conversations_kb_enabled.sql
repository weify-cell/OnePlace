-- v1.11 kb-enabled
-- 新增知识库相关字段：对话启用知识库开关、笔记知识库标记
-- 注意：列可能已存在（早期 KB 迁移），若报错忽略即可
SELECT 'Running 007_conversations_kb_enabled migration' as status;