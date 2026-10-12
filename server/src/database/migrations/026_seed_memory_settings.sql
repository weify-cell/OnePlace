-- v2.4 seed-memory-settings
INSERT OR IGNORE INTO settings (key, value, description) VALUES
('qdrant_memory_collection', '"oneplace_memory"', '记忆向量库 collection 名称（独立于笔记知识库 oneplace）'),
('ilink_memory_prompt_max_items', '0', '注入的当前状态记忆条数上限（只统计状态型记忆的当前值）；填正数就用该值，0 或未设则用默认上界 10 条');
SELECT '026_seed_memory_settings done' as status;
