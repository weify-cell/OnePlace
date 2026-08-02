-- v2.4 seed-memory-settings
INSERT OR IGNORE INTO settings (key, value, description) VALUES
('qdrant_memory_collection', '"oneplace_memory"', '记忆向量库 collection 名称（独立于笔记知识库 oneplace）'),
('ilink_memory_prompt_max_items', '0', '对话附带近30天记忆的条目上限，0 表示不限制');
SELECT '026_seed_memory_settings done' as status;
