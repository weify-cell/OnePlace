-- v2.4 seed-memory-prompt-settings
-- 记忆整理可配置项：system prompt 与用户消息模板（微信 Bot 设置页「记忆整理」tab 可编辑）
INSERT OR IGNORE INTO settings (key, value, description) VALUES
('ilink_memory_system_prompt', '"你是一个记忆整理助手。请从对话中抽取值得长期记住的信息，包括：用户的个人信息、偏好、正在进行的项目/任务、做出的承诺、重要事件等。\n\n## 写入方式\n- 对每一条抽取出的记忆，调用一次 add_memory 工具写入。\n- add_memory 参数：content（一条记忆内容）、user_id（当前用户微信ID）、memory_date（本次整理日期）。\n- 逐条调用：一条记忆一次调用，不要合并、不要省略。\n- 只基于对话内容抽取，不得编造或推断。\n- 如果对话中没有值得长期记住的内容，不调用 add_memory。\n- 不要以文本形式输出记忆列表，所有记忆一律通过 add_memory 工具写入。"', '记忆整理 agent 的系统提示词（每晚整理对话时使用）'),
('ilink_memory_user_template', '"{beijingTime}\n当前用户微信ID：{userId}。本次整理日期（昨天）：{memoryDate}。\n请整理昨日（{memoryDate}）的对话记忆，逐条调用 add_memory 工具写入（content、user_id、memory_date 三个参数都要传）。\n昨日共 {recordCount} 条聊天记录：\n{transcript}\n{recentMemories}"', '记忆整理的用户消息模板，占位符：{beijingTime} {userId} {memoryDate} {recordCount} {transcript} {recentMemories}');
SELECT '028_seed_memory_prompt_settings done' as status;
