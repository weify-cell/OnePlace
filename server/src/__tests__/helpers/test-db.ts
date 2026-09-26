import Database from 'better-sqlite3'
import { runMigrations } from '../../database/migrate.js'

// 注意：本文件**不能** import 任何应用模块（services/ 等）——它会被
// vi.mock('../database/index.js') 的工厂 import，而应用模块又会回头 import
// 那个被 mock 的 database，形成环并把 mock 工厂自己卡死。

/**
 * 测试用的**真数据库**：内存 SQLite，schema 由真迁移建立。
 *
 * 这里换掉的是「连接」这个系统边界，不是把数据库行为 mock 掉——
 * 因此测试里查到的表结构就是生产的那一套，不需要在测试里手写 DDL 抄一份 schema。
 */
const db = new Database(':memory:')

runMigrations(db)

/** 交给 `vi.mock('../database/index.js', ...)` 的工厂 */
export function connectDatabase(): Database.Database {
  return db
}

/**
 * 让真迁移重建 schema。
 *
 * 迁移本身是幂等的（`_migrations` 去重），所以只删掉建表那条迁移的记录再跑一次，
 * 就能把被某个用例破坏过的表恢复成真 schema——不必手写一份 DDL 副本。
 */
export function restoreSchema(): void {
  db.prepare("DELETE FROM _migrations WHERE filename = '001_initial_schema.sql'").run()
  runMigrations(db)
}
