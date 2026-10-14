-- v2.6 phone-locations
-- 手机轨迹点：设备采集的原始位置（经纬度、精度、速度、来源）
--
-- 约定：
-- - recorded_at 是**设备侧采集时刻**（UTC ISO），received_at 是服务器收到的时刻；
--   两者都留着，因为手机时钟可能不准，而重传会让"收到时刻"与采集时刻脱节。
-- - UNIQUE(device_id, recorded_at) 是幂等键：App 断网重传、批量重发都不会产生重复点。
CREATE TABLE IF NOT EXISTS phone_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy REAL,
  speed REAL,
  source TEXT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(device_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS idx_phone_locations_device_time
  ON phone_locations(device_id, recorded_at);

SELECT '030_phone_locations done' as status;
