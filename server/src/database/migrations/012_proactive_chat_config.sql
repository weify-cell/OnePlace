-- v1.18 proactive-chat-config
-- 主动聊天配置
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_proactive_chat_enabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_proactive_chat_min_interval', '45');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_proactive_chat_quiet_hours_start', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_proactive_chat_quiet_hours_end', '8');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_proactive_chat_check_interval', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_proactive_chat_user_message', '"请生成一条主动问候消息"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_proactive_chat_system_prompt', '"你是一个友好的微信助手，请主动找用户聊天。语气亲切随意，控制在1-2句话，可以使用表情符号。"');
SELECT '012_proactive_chat_config done' as status;
