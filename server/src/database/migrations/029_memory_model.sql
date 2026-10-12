-- v2.5 memory-model
-- 记忆模型：类型与主题（状态型/事件型）、被取代、最近命中、归档（退场不删行）
--
-- 说明：本应是「不用迁移文件、直接改库」的一次性动作，但**代码要依赖这五个列**——
-- 只改库不改迁移，新装环境启动就会因缺列报错。因此按用户 2026-10-12 的特别许可
-- 破例写成本文件（仓库既有 ALTER TABLE 先例：004/005/008/009/016/021/022）。
--
-- 历史数据不回填：既有 205 条 kind 为 NULL，即「未分类」——
-- 不参与取代、不参与退场，但仍可被检索命中，随时间自然消失。

ALTER TABLE wechat_memories ADD COLUMN kind TEXT;             -- state=状态型 / event=事件型 / NULL=未分类
ALTER TABLE wechat_memories ADD COLUMN topic TEXT;            -- 状态型的主题键：同键新值取代旧值
ALTER TABLE wechat_memories ADD COLUMN superseded_by INTEGER; -- 被哪条记忆取代（归档原因之一）
ALTER TABLE wechat_memories ADD COLUMN last_hit_at TEXT;      -- 最近一次被检索命中的时间
ALTER TABLE wechat_memories ADD COLUMN archived_at TEXT;      -- 退场时间（归档不物理删行）

CREATE INDEX IF NOT EXISTS idx_wechat_memories_live
  ON wechat_memories(user_id, kind, archived_at);

SELECT '029_memory_model done' as status;
