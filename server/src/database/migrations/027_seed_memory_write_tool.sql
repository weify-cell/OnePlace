-- v2.4 seed-memory-write-tool
-- 注册记忆写入内置工具 add_memory（记忆整理 agent 与普通对话共用，管理页可启停）
INSERT OR IGNORE INTO tools (name, label, description, enabled) VALUES
('add_memory', '记住记忆', '记住一条长期记忆：把一句事实、偏好或承诺写入记忆库（含语义向量），重复内容自动忽略。用于需要长期记住的信息。', 1);
SELECT '027_seed_memory_write_tool done' as status;
