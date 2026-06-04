-- v1.13 tool-calls
-- messages 表：存储工具调用记录
ALTER TABLE messages ADD COLUMN tool_calls TEXT;
-- conversations 表：工具调用配置
ALTER TABLE conversations ADD COLUMN tools_enabled INTEGER DEFAULT 0;
ALTER TABLE conversations ADD COLUMN max_tool_rounds INTEGER DEFAULT 5;
SELECT '009_tool_calls done' as status;
