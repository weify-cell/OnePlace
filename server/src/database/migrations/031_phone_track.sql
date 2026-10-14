-- v2.6 phone-track
-- 轨迹加工结果：停留、行程，以及每台设备的增量处理状态
--
-- 约定：
-- - 停留/行程都是**闭合后**才落表（未闭合的段留存在 phone_track_state 里），
--   所以 UNIQUE(device_id, kind 由表本身区分, started_at, ended_at) 足以保证重跑幂等。
-- - phone_track_state 存 JSON：它是纯函数的输入输出状态，形状由 track-segmenter 决定；
--   拆成列会让算法演进变成 schema 变更。
-- - 跨天不切断：段的时间跨午夜是正常情况，不做日期切分。

CREATE TABLE IF NOT EXISTS phone_stays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  center_lat REAL NOT NULL,
  center_lon REAL NOT NULL,
  radius_m REAL NOT NULL,
  sample_count INTEGER NOT NULL,
  place_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(device_id, started_at, ended_at)
);
CREATE INDEX IF NOT EXISTS idx_phone_stays_device_time ON phone_stays(device_id, started_at);

CREATE TABLE IF NOT EXISTS phone_trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  start_lat REAL NOT NULL,
  start_lon REAL NOT NULL,
  end_lat REAL NOT NULL,
  end_lon REAL NOT NULL,
  distance_m REAL NOT NULL,
  sample_count INTEGER NOT NULL,
  start_stay_id INTEGER,
  end_stay_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(device_id, started_at, ended_at)
);
CREATE INDEX IF NOT EXISTS idx_phone_trips_device_time ON phone_trips(device_id, started_at);

CREATE TABLE IF NOT EXISTS phone_track_state (
  device_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 注册内置工具：机器人可读轨迹结论（工具管理页可启停）
--
-- 注意：**不指定分类**。新装库里 tool_categories 是空的（现有分类都是用户在界面上建的），
-- 写死 category_id 会在新装环境撞外键——这类"只在活库成立"的假设已经在迁移 028/029 上
-- 栽过一次，别再犯。
INSERT OR IGNORE INTO tools (name, label, description, enabled) VALUES
('get_location_history', '查询位置轨迹', '读取用户手机轨迹加工后的结论：某段时间内的停留（在哪、待了多久）与行程（起止、里程、时长）。这是用户手机的真实轨迹结论，不是猜测。当用户问"我今天去哪了""这周通勤多久""我几点到家"时用它。', 1);

SELECT '031_phone_track done' as status;
