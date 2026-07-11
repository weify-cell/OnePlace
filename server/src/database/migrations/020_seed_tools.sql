-- v2.1 刷入13个内置工具的初始记录
INSERT OR IGNORE INTO tools (name, label, description, enabled) VALUES
('list_notes', '列出笔记', '列出笔记列表，可按文件夹筛选。用于了解用户的笔记概况。', 1),
('search_note_lines', '搜索笔记行', '在指定笔记中搜索关键词，返回匹配行的上下文。', 1),
('get_note_lines', '获取笔记行', '获取指定笔记的行号范围内容。', 1),
('list_folders', '列出文件夹', '列出所有文件夹', 1),
('get_todo', '获取待办详情', '获取指定待办任务的详细信息', 1),
('create_todo', '创建待办', '创建新的待办任务', 1),
('update_todo', '更新待办', '更新待办任务的状态或信息', 1),
('delete_todo', '删除待办', '删除指定的待办任务', 1),
('update_todo_progress', '更新待办进度', '更新长期待办任务的进度百分比和备注', 1),
('get_todo_progress_logs', '获取进度日志', '获取长期待办任务的进度更新日志', 1),
('search_knowledge_base', '搜索知识库', '搜索知识库中的笔记文档，返回相关内容片段。用于回答用户关于笔记内容的问题。', 1),
('get_formatted_todos', '查询待办', '查询待办任务列表，可按状态、优先级、关键词筛选', 1),
('get_current_time', '获取当前时间', '获取当前北京时间，格式为 ISO 8601', 1);

SELECT '020_seed_tools done' as status;
