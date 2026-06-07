-- v1.15 todo-reminder
-- 待办任务提醒字段
ALTER TABLE todos ADD COLUMN reminder_time TEXT;
ALTER TABLE todos ADD COLUMN reminder_enabled INTEGER DEFAULT 1;
SELECT '011_todo_reminder done' as status;
