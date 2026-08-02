-- v2.4 seed-memory-tools
-- 注册两个记忆检索内置工具（工具管理页可启停，loadToolsFromDb 生效）
INSERT OR IGNORE INTO tools (name, label, description, enabled) VALUES
('search_memory', '搜索记忆', '在微信 Bot 的长期记忆库中按关键词检索，返回相关的记忆条目。用于回忆过往对话中提到的事实、偏好或事件。', 1),
('search_memory_vectors', '语义搜索记忆', '在微信 Bot 的长期记忆向量库中按语义相似度检索，返回相关的记忆条目。用于模糊回忆、语义相关的历史信息。', 1);
SELECT '025_seed_memory_tools done' as status;
