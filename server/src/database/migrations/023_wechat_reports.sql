-- v2.4 wechat-reports
-- 微信日报/周报/月报存储
CREATE TABLE IF NOT EXISTS wechat_reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT    NOT NULL,
  report_type  TEXT    NOT NULL CHECK(report_type IN ('daily','weekly','monthly')),
  period_start TEXT    NOT NULL,
  period_end   TEXT    NOT NULL,
  content      TEXT    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, report_type, period_start)
);
CREATE INDEX IF NOT EXISTS idx_wechat_reports_user_type
ON wechat_reports(user_id, report_type, period_start);

SELECT '023_wechat_reports done' as status;
