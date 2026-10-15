-- v2.6 phone-places-events
-- 常去地点与轨迹事件
--
-- 约定：
-- - 地点由停留匹配而来：200 m 内视为同一处；命中次数与"不同天数"分别计数，
--   够频繁（≥3 次且 ≥3 天）才算常去——命名之前它只是「某个反复出现的停留」。
-- - 事件只在段闭合时生成，且 UNIQUE(device_id, event_type, target_kind, target_id)
--   保证重跑不会重复生成（重传、崩溃重启都会重跑加工）。
-- - consumed_at 由推送环节填写；为空的即"还没被消费的事件"。

CREATE TABLE IF NOT EXISTS phone_places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  center_lat REAL NOT NULL,
  center_lon REAL NOT NULL,
  radius_m REAL NOT NULL,
  name TEXT,
  hit_count INTEGER NOT NULL DEFAULT 0,
  day_count INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_phone_places_device ON phone_places(device_id, hit_count);

CREATE TABLE IF NOT EXISTS phone_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  place_id INTEGER,
  occurred_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(device_id, event_type, target_kind, target_id)
);
CREATE INDEX IF NOT EXISTS idx_phone_events_pending ON phone_events(consumed_at, occurred_at);

-- 注册「给地点命名」工具：用户在微信里说「把那个地方命名为家」即可（不指定则给最近停留的那处）
INSERT OR IGNORE INTO tools (name, label, description, enabled) VALUES
('name_place', '给地点命名', '给手机轨迹里识别出的地点起个名字（如"家""公司""健身房"）。用于让机器人以后能用名字指代那个地方。地点编号可以从"查询位置轨迹"的结果里看到。', 1);

SELECT '032_phone_places_events done' as status;
