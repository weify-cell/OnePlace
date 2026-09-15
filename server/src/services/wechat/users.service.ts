import { connectDatabase } from '../../database/index.js'

/**
 * 微信用户注册表。
 *
 * 用户注册表寄存在 `settings` 键值表里（键前缀 `ilink_user_`）。本模块是该约定的唯一归属：
 * 前缀、注册、枚举、最后活跃时间都只在这里出现，其他模块只说「用户」——
 * 不再需要知道键前缀，也不再需要自己写 SQL。
 */

/** `settings` 表中寄存微信用户的键前缀 */
const USER_KEY_PREFIX = 'ilink_user_'

/** 枚举上限：单用户部署下足够，且避免 settings 表膨胀时做全量扫描 */
const MAX_USERS = 10

/**
 * 注册（或刷新）一个微信用户。
 * 重复调用只刷新 `updated_at`（保留既有 description 列，避免 INSERT OR REPLACE 重置），
 * 因此 `updated_at` 同时就是「该用户最后一次发消息的时间」。
 */
export function saveWeChatUser(userId: string): void {
  const db = connectDatabase()
  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(`${USER_KEY_PREFIX}${userId}`, '1')
}

/** 枚举已知微信用户 ID。 */
export function getWeChatUsers(): string[] {
  const db = connectDatabase()
  const rows = db.prepare(
    'SELECT DISTINCT key as userId FROM settings WHERE key LIKE ? LIMIT ?'
  ).all(`${USER_KEY_PREFIX}%`, MAX_USERS) as Array<{ userId: string }>
  return rows.map(r => r.userId.slice(USER_KEY_PREFIX.length))
}

/** 该用户最后一次发消息的时间（毫秒时间戳）；未注册返回 null。 */
export function getUserLastActiveTime(userId: string): number | null {
  const db = connectDatabase()
  const row = db.prepare('SELECT updated_at FROM settings WHERE key = ?')
    .get(`${USER_KEY_PREFIX}${userId}`) as { updated_at: string } | undefined
  return row?.updated_at ? new Date(row.updated_at).getTime() : null
}
