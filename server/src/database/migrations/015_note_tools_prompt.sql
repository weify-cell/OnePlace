-- v1.19 shared note tools prompt
INSERT OR IGNORE INTO settings (key, value)
SELECT 'note_tools_prompt', value
FROM settings
WHERE key = 'ilink_tool_usage_prompt';

INSERT OR IGNORE INTO settings (key, value) VALUES (
  'note_tools_prompt',
  '"当问题涉及用户笔记内容时，先使用 list_notes 查找候选笔记，再使用 search_note_lines 定位关键词，最后使用 get_note_lines 按行读取需要的内容。避免一次性读取整篇笔记；如果没有找到相关内容，要明确说明。"'
);

SELECT '015_note_tools_prompt done' as status;
