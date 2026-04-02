-- v1.10 todo-status-tabs
-- 新增 completed_at 字段记录任务完成时间
ALTER TABLE todos ADD COLUMN completed_at DATETIME DEFAULT NULL;