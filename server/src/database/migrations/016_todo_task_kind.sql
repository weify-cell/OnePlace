ALTER TABLE todos
ADD COLUMN task_kind TEXT NOT NULL DEFAULT 'one_time';

UPDATE todos
SET task_kind = 'one_time'
WHERE task_kind IS NULL OR task_kind = '';

SELECT '016_todo_task_kind done' as status;
