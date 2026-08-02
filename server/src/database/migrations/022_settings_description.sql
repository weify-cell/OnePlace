-- v2.3 settings-description
-- settings 表新增配置描述字段，用于界面展示配置用途说明
ALTER TABLE settings ADD COLUMN description TEXT NOT NULL DEFAULT '';

SELECT '022_settings_description done' as status;
