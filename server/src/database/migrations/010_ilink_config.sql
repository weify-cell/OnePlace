-- v1.14 ilink-config
-- iLink Bot 配置
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_enabled', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_bot_token', '""');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_api_base_url', '"https://ilinkai.weixin.qq.com"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_provider', '"qwen"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_model', '"qwen-turbo"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_system_prompt', '"你是一个智能助手，可以通过微信为用户提供服务。请用中文回复。"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_max_tool_rounds', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_reminder_enabled', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_reminder_interval', '60');
SELECT '010_ilink_config done' as status;
