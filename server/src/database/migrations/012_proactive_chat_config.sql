-- v1.18 proactive-chat-config
-- 主动聊天配置
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_proactive_chat_enabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_proactive_chat_min_interval', '45');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_proactive_chat_quiet_hours_start', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_proactive_chat_quiet_hours_end', '8');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_proactive_chat_check_interval', '5');
SELECT '012_proactive_chat_config done' as status;
