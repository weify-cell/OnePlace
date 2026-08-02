# 微信 Bot 记忆功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给微信 Bot 增加长期记忆：每晚 00:30 对当天对话做记忆整理（抽取离散记忆条目），结果写入数据库 + 独立向量库；与 Bot 对话时在 system prompt 附加上近 30 天全部记忆；并提供数据库检索与向量检索两个 Agent 工具。

**Architecture:** 镜像现有 `report.service.ts` 的调度模式（`setInterval` 60s 心跳 + 北京时区到点判定 + in-flight 锁）。新增 `wechat_memories` 表 + 独立 Qdrant collection `oneplace_memory`。记忆整理复用 `runAgentTurn` 完整 agent loop（`loadHistory:false`、`removeAfterRun:true`）。对话附记在 bot `onMessage` 组装 `effectivePrompt` 时追加；两个检索工具注册进 `builtin-tools.ts` 并种子到 `tools` 表，可管理页启停。

**Tech Stack:** Express + better-sqlite3（ESM）、Qdrant（REST）、qwen embedding（复用 `embedText`）、vitest。

## Global Constraints

- **ESM**：server 端本地相对导入必须带 `.js` 后缀（`import ... from './foo.js'`）。
- **代码/注释用中文**，与现有文件风格一致。
- **迁移编号**：新增 `024_wechat_memories.sql`、`025_seed_memory_tools.sql`、`026_seed_memory_settings.sql`。018 被有意跳过，勿动既有迁移。
- **settings 播种**：`INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)`（description 列自迁移 022 起存在）。
- **`vector.service.ts` 改造必须向后兼容**：笔记路径（`qdrant_collection` 默认 collection）行为不变，新增 collection 参数与 filter 为可选。
- **测试沿用 `report.service.test.ts` 手法**：`vi.mock('../database/index.js', async () => ...)`（vitest 4.x 同步工厂会 TDZ）+ `vi.doMock` 动态 import 的 ilink-bot。
- **`runAgentTurn` 不改签名**：记忆整理复用现有调用（`loadHistory:false`、`removeAfterRun:true`），systemPrompt 指令声明「不要调用任何工具」（与 report 一致）。
- 不得破坏现有 report / reminder / proactive-chat 服务。

---

### Task 1: 数据层 — 迁移 + report.service 导出 + schema 文档

**Files:**
- Create: `server/src/database/migrations/024_wechat_memories.sql`
- Create: `server/src/database/migrations/025_seed_memory_tools.sql`
- Create: `server/src/database/migrations/026_seed_memory_settings.sql`
- Modify: `server/src/services/wechat/report.service.ts:167,176`（给 `getWeChatUsers`、`buildTranscript` 加 `export`）
- Modify: `docs/database-schema.md`（新增第 17 节）

**Interfaces:**
- Consumes: 无（纯 SQL / 小改动）
- Produces: `report.service.ts` 新增导出 `buildTranscript(rows): string`、`getWeChatUsers(): string[]`（Task 4 消费）

- [ ] **Step 1: 创建 `024_wechat_memories.sql`**

```sql
-- v2.4 wechat-memories
-- 微信 Bot 长期记忆：每晚整理当天对话抽取的离散记忆条目
CREATE TABLE IF NOT EXISTS wechat_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  memory_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, content)
);
CREATE INDEX IF NOT EXISTS idx_wechat_memories_user_date ON wechat_memories(user_id, memory_date, id);
SELECT '024_wechat_memories done' as status;
```

- [ ] **Step 2: 创建 `025_seed_memory_tools.sql`**

```sql
-- v2.4 seed-memory-tools
-- 注册两个记忆检索内置工具（工具管理页可启停，loadToolsFromDb 生效）
INSERT OR IGNORE INTO tools (name, label, description, enabled) VALUES
('search_memory', '搜索记忆', '在微信 Bot 的长期记忆库中按关键词检索，返回相关的记忆条目。用于回忆过往对话中提到的事实、偏好或事件。', 1),
('search_memory_vectors', '语义搜索记忆', '在微信 Bot 的长期记忆向量库中按语义相似度检索，返回相关的记忆条目。用于模糊回忆、语义相关的历史信息。', 1);
SELECT '025_seed_memory_tools done' as status;
```

- [ ] **Step 3: 创建 `026_seed_memory_settings.sql`**

```sql
-- v2.4 seed-memory-settings
INSERT OR IGNORE INTO settings (key, value, description) VALUES
('qdrant_memory_collection', '"oneplace_memory"', '记忆向量库 collection 名称（独立于笔记知识库 oneplace）'),
('ilink_memory_prompt_max_items', '0', '对话附带近30天记忆的条目上限，0 表示不限制');
SELECT '026_seed_memory_settings done' as status;
```

- [ ] **Step 4: 给 report.service 的两个私有函数加 `export`**

`server/src/services/wechat/report.service.ts`：
- 第 167 行 `function getWeChatUsers(): string[] {` → `export function getWeChatUsers(): string[] {`
- 第 176 行 `function buildTranscript(rows: Array<{ role: string; content: string }>): string {` → `export function buildTranscript(...)`

- [ ] **Step 5: 更新 `docs/database-schema.md`**

在 `## 16. wechat_reports` 一节之后、`## 补充说明` 之前插入第 17 节（字段表 + 注释 + CREATE TABLE + 索引），格式对齐第 16 节：

```markdown
## 17. `wechat_memories` — 微信 Bot 长期记忆

| 字段 | 类型 | 约束/默认 | 注释 |
|------|------|-----------|------|
| id | INTEGER | PK, AUTOINCREMENT | 主键 |
| user_id | TEXT | NOT NULL | 微信用户 ID |
| content | TEXT | NOT NULL | 单条记忆内容 |
| memory_date | TEXT | NOT NULL | 北京日期 YYYY-MM-DD（该记忆整理自哪天） |
| created_at | TEXT | NOT NULL DEFAULT (now) | 生成时间 |

> 微信 Bot 每晚 00:30 整理当天对话抽取的离散记忆条目（迁移 024）。`UNIQUE(user_id, content)` 内容级去重兜底，防止 LLM 重复抽取。向量副本存 Qdrant 独立 collection `oneplace_memory`（见配置 `qdrant_memory_collection`）。

```sql
CREATE TABLE wechat_memories (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT    NOT NULL,
  content      TEXT    NOT NULL,
  memory_date  TEXT    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, content)
);
```

索引：

```sql
CREATE INDEX idx_wechat_memories_user_date
ON wechat_memories(user_id, memory_date, id);
```

---

```

- [ ] **Step 6: 验证迁移可执行**

Run:
```bash
cd server && npx tsx -e "
import Database from 'better-sqlite3';
import { runMigrations } from './src/database/migrate.js';
const db = new Database(':memory:');
runMigrations(db);
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all().map((r: any) => r.name);
console.log('has wechat_memories:', tables.includes('wechat_memories'));
console.log('memory tools:', db.prepare(\"SELECT name FROM tools WHERE name IN ('search_memory','search_memory_vectors')\").all());
console.log('memory settings:', db.prepare(\"SELECT key, description FROM settings WHERE key IN ('qdrant_memory_collection','ilink_memory_prompt_max_items')\").all());
"
```
Expected: `has wechat_memories: true`、两条 tool 记录、两条带 description 的 setting 记录。若 `search_memory_vectors` 报 tools 表无 `instruction`/`category_id` 列（019 已含），则以实际 schema 为准调整种子列（与 020_seed_tools.sql 对齐）。

- [ ] **Step 7: 跑既有测试确认无回归**

Run: `cd server && npx vitest run src/__tests__/report.service.test.ts`
Expected: 全部通过（report 的导出改动不影响行为）。

- [ ] **Step 8: 提交**

```bash
git add server/src/database/migrations/024_wechat_memories.sql server/src/database/migrations/025_seed_memory_tools.sql server/src/database/migrations/026_seed_memory_settings.sql server/src/services/wechat/report.service.ts docs/database-schema.md
git commit -m "feat: 记忆功能数据层——wechat_memories 表/工具与配置种子/文档 + report 复用导出"
```

---

### Task 2: `vector.service.ts` 支持 collection 参数与 user_id 过滤

**Files:**
- Modify: `server/src/services/vector/vector.service.ts`
- Test: `server/src/__tests__/vector.service.test.ts`（新建）

**Interfaces:**
- Consumes: 无
- Produces: `ensureCollection(collection?: string)`、`upsertChunks(chunks, collection?: string)`、`searchChunks(queryVector, topK, opts?: { collection?: string; filter?: { must: Array<{ key: string; match: { value: string | number } }> } })`。全部可选参数，笔记路径行为不变（Task 4 消费）。

- [ ] **Step 1: 写失败测试 `server/src/__tests__/vector.service.test.ts`**

```ts
import { describe, expect, it, vi, afterEach } from 'vitest'
import { upsertChunks, searchChunks } from '../services/vector/vector.service.js'

vi.mock('../services/settings.service.js', () => ({
  getSettingValue: vi.fn((key: string, def: unknown) => {
    const map: Record<string, unknown> = {
      qdrant_url: 'http://qdrant.test:6333',
      qdrant_collection: 'oneplace',
      qdrant_memory_collection: 'oneplace_memory'
    }
    return map[key] ?? def
  })
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

afterEach(() => { fetchMock.mockReset() })

describe('upsertChunks collection 参数', () => {
  it('使用指定 collection 并携带 metadata', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { collections: [{ name: 'oneplace_memory' }] } }) }) // GET /collections
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { operation_id: 1 } }) }) // PUT points
    await upsertChunks(
      [{ id: 'mem1', vector: [0.1, 0.2], content: '用户喝美式', metadata: { memory_id: 1, user_id: 'u1', memory_date: '2026-08-01' } }],
      'oneplace_memory'
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const putUrl = String(fetchMock.mock.calls[1][0])
    expect(putUrl).toContain('/collections/oneplace_memory/points')
    const body = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))
    expect(body.points[0].id).toBe('mem1')
    expect(body.points[0].payload).toMatchObject({ content: '用户喝美式', memory_id: 1, user_id: 'u1' })
  })
})

describe('searchChunks collection + filter', () => {
  it('透传 collection、filter 并映射结果', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: [{ id: 'mem1', score: 0.9, payload: { content: 'x', memory_id: 1 } }] })
    })
    const res = await searchChunks([0.1, 0.2], 5, {
      collection: 'oneplace_memory',
      filter: { must: [{ key: 'user_id', match: { value: 'u1' } }] }
    })
    const reqUrl = String(fetchMock.mock.calls[0][0])
    expect(reqUrl).toContain('/collections/oneplace_memory/points/search')
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body.filter).toEqual({ must: [{ key: 'user_id', match: { value: 'u1' } }] })
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ id: 'mem1', score: 0.9 })
  })

  it('不传 opts 时默认 collection 行为不变', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ result: [] }) })
    await searchChunks([0.1], 5)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/collections/oneplace/points/search')
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body.filter).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd server && npx vitest run src/__tests__/vector.service.test.ts`
Expected: FAIL（`searchChunks`/`upsertChunks` 尚不接受 collection/filter 参数，TS/运行时行为不符）。

- [ ] **Step 3: 实现 collection 参数**

`server/src/services/vector/vector.service.ts`：

```ts
export async function ensureCollection(collection?: string): Promise<void> {
  const name = collection ?? getCollectionName()
  const res = await request<{ result: { collections: { name: string }[] } }>('GET', '/collections')
  const exists = res.result.collections.some((c) => c.name === name)
  if (exists) return

  await request('PUT', `/collections/${name}`, {
    vectors: {
      size: VECTOR_SIZE,
      distance: DISTANCE,
    },
  })
}
```

`upsertChunks`：签名加 `collection?: string`，函数体 `ensureCollection()` 改 `ensureCollection(collection)`，collection 变量由 `getCollectionName()` 改 `collection ?? getCollectionName()`：

```ts
export async function upsertChunks(chunks: Array<{ id: string; vector: number[]; content: string; metadata?: Record<string, unknown> }>, collection?: string): Promise<UpsertResult> {
  await ensureCollection(collection)
  if (chunks.length === 0) return { success: true, count: 0 }

  const name = collection ?? getCollectionName()
  const points: Array<{ id: number | string; vector: number[]; payload: Record<string, unknown> }> = chunks.map((c) => ({
    id: /^\d+$/.test(c.id) ? Number(c.id) : c.id,
    vector: c.vector,
    payload: { content: c.content, ...c.metadata },
  }))

  try {
    await request('PUT', `/collections/${name}/points`, { points })
    return { success: true, count: chunks.length }
  } catch (err) {
    console.error('[vector] upsertChunks failed:', err)
    return { success: false, error: (err as Error).message }
  }
}
```

- [ ] **Step 4: 实现 searchChunks filter + collection**

`server/src/services/vector/vector.service.ts` 的 `searchChunks` 整体替换为：

```ts
export async function searchChunks(
  queryVector: number[],
  topK: number,
  opts?: {
    collection?: string
    filter?: { must: Array<{ key: string; match: { value: string | number } }> }
  }
): Promise<SearchResult[]> {
  const name = opts?.collection ?? getCollectionName()
  const body: Record<string, unknown> = { vector: queryVector, limit: topK, with_payload: true }
  if (opts?.filter) body.filter = opts.filter
  console.log(`[vector] searchChunks: collection=${name}, vectorLen=${queryVector.length}`)
  try {
    const res = await request<{
      result?: Array<{ id: unknown; score: number; payload?: Record<string, unknown> }>
      results?: Array<{ id: unknown; score: number; payload?: Record<string, unknown> }>
      status?: string
      error?: string
    }>('POST', `/collections/${name}/points/search`, body)

    console.log(`[vector] searchChunks response:`, JSON.stringify(res).slice(0, 500))

    const resultItems = res.result || res.results

    if (!resultItems) {
      console.error('[vector] searchChunks: no result field, response:', res)
      return []
    }

    return resultItems.map((r) => {
      console.log(`[vector] point id=${r.id}, score=${r.score}, payload=`, JSON.stringify(r.payload).slice(0, 200))
      return {
        id: normalizePointId(r.id),
        score: r.score,
        payload: r.payload || {},
      }
    })
  } catch (err) {
    console.error('[vector] searchChunks failed:', err)
    throw err
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd server && npx vitest run src/__tests__/vector.service.test.ts`
Expected: PASS（3 例）。

- [ ] **Step 6: typecheck**

Run: `cd server && npm run typecheck`
Expected: 通过，无 `knowledge-base.service` 等既有调用方报错。

- [ ] **Step 7: 提交**

```bash
git add server/src/services/vector/vector.service.ts server/src/__tests__/vector.service.test.ts
git commit -m "feat: vector.service 支持 collection 参数与 user_id 过滤（向后兼容）"
```

---

### Task 3: memory.service 核心 — 纯函数 + DB 层 + 附记段

**Files:**
- Create: `server/src/services/wechat/memory.service.ts`（本任务只写核心部分）
- Modify: `server/src/services/prompt-defaults.ts`（追加 `DEFAULT_MEMORY_SYSTEM_PROMPT`，Task 4 用）
- Test: `server/src/__tests__/memory.service.test.ts`（新建，本任务写核心测试；Task 4 追加整理测试）

**Interfaces:**
- Consumes: `connectDatabase`（database/index.js）、`getSettingValue`（settings.service.js）
- Produces:
  - `isMemoryDue(now: Date): boolean` — 北京 00:30 到点，分钟 ≤1 容忍
  - `getMemoryDate(now: Date): string` — 北京 YYYY-MM-DD
  - `saveMemory(userId, content, memoryDate): number` — 落表，返回新 id，重复返回 0
  - `queryMemories(userId, opts?: { days?: number; limit?: number }): MemoryRow[]`
  - `searchMemories(query, opts?: { userId?: string; limit?: number }): MemoryRow[]`
  - `parseMemoryItems(text: string): string[]`
  - `buildMemoryPrompt(userId: string): string` — 近30天附记段，空则 `''`
  - `DEFAULT_MEMORY_SYSTEM_PROMPT`（prompt-defaults.ts）

- [ ] **Step 1: 写失败测试 `server/src/__tests__/memory.service.test.ts`（核心部分）**

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('../database/index.js', async () => {
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE wechat_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      memory_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, content)
    );
    CREATE TABLE wechat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `)
  return { connectDatabase: () => db }
})

import { connectDatabase } from '../database/index.js'
import {
  isMemoryDue, getMemoryDate, saveMemory, queryMemories,
  searchMemories, parseMemoryItems, buildMemoryPrompt
} from '../services/wechat/memory.service.js'

describe('isMemoryDue', () => {
  const DUE_830 = new Date('2026-08-01T16:30:00.000Z')   // 北京 8-02 00:30
  const DUE_831 = new Date('2026-08-01T16:31:00.000Z')   // 北京 8-02 00:31（容忍）
  const OFF_832 = new Date('2026-08-01T16:32:00.000Z')   // 北京 8-02 00:32
  const OFF_800 = new Date('2026-08-01T16:00:00.000Z')   // 北京 8-02 00:00
  const OFF_100 = new Date('2026-08-01T17:00:00.000Z')   // 北京 8-02 01:00

  it('北京 00:30 到点，00:31 容忍，00:32 不再触发', () => {
    expect(isMemoryDue(DUE_830)).toBe(true)
    expect(isMemoryDue(DUE_831)).toBe(true)
    expect(isMemoryDue(OFF_832)).toBe(false)
    expect(isMemoryDue(OFF_800)).toBe(false)
    expect(isMemoryDue(OFF_100)).toBe(false)
  })
})

describe('getMemoryDate', () => {
  it('返回北京 YYYY-MM-DD', () => {
    expect(getMemoryDate(new Date('2026-08-01T16:30:00.000Z'))).toBe('2026-08-02') // 北京 00:30
    expect(getMemoryDate(new Date('2026-07-31T16:00:00.000Z'))).toBe('2026-08-01') // 北京 00:00
    expect(getMemoryDate(new Date('2026-08-02T14:00:00.000Z'))).toBe('2026-08-02') // 北京 22:00
  })
})

describe('saveMemory', () => {
  it('落表返回新 id；(user, content) 去重返回 0', () => {
    const db = connectDatabase()
    const id1 = saveMemory('u1', '用户喝美式', '2026-08-01')
    const id2 = saveMemory('u1', '用户喝美式', '2026-08-02') // 同内容 → 去重
    const id3 = saveMemory('u1', '项目A在开发', '2026-08-01')
    expect(id1).toBeGreaterThan(0)
    expect(id2).toBe(0)
    expect(id3).toBeGreaterThan(0)
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_memories').get()).toMatchObject({ c: 2 })
  })
})

describe('queryMemories', () => {
  it('近 N 天过滤 + 用户隔离', () => {
    const now = new Date()
    saveMemory('u1', '三十天前的事', getMemoryDate(new Date(now.getTime() - 30 * 86400000)))
    saveMemory('u1', '最近的事', getMemoryDate(now))
    saveMemory('u2', '别人的事', getMemoryDate(now))
    const rows = queryMemories('u1', { days: 30 })
    expect(rows.map(r => r.content)).toContain('最近的事')
    expect(rows.map(r => r.content)).not.toContain('三十天前的事')
    expect(rows.every(r => r.user_id === 'u1')).toBe(true)
  })
})

describe('searchMemories', () => {
  it('关键词 + 用户过滤', () => {
    const today = getMemoryDate(new Date())
    saveMemory('u1', '用户喝美式咖啡', today)
    saveMemory('u1', '项目A进入测试阶段', today)
    saveMemory('u2', '用户喝拿铁', today)
    const rows = searchMemories('美式', { userId: 'u1' })
    expect(rows.map(r => r.content)).toContain('用户喝美式咖啡')
    expect(rows.map(r => r.content)).not.toContain('用户喝拿铁')
    expect(searchMemories('美式')).toHaveLength(2)
  })
})

describe('parseMemoryItems', () => {
  it('兼容 - / * / 数字 / 普通行，过滤空行/过短/标题/无', () => {
    const out = parseMemoryItems('- 用户喝美式\n* 项目A在开发\n1. 用户周日常跑步\n普通行也算\n\n   \n无\n## 标题\n# 另一个标题')
    expect(out).toEqual(['用户喝美式', '项目A在开发', '用户周日常跑步', '普通行也算'])
  })
})

describe('buildMemoryPrompt', () => {
  it('近30天附记包含记忆与用户ID；无记忆返回空串', () => {
    saveMemory('u1', '用户喝美式', getMemoryDate(new Date()))
    const p = buildMemoryPrompt('u1')
    expect(p).toContain('## 记忆（近30天）')
    expect(p).toContain('当前用户微信ID：u1')
    expect(p).toContain('用户喝美式')
    expect(buildMemoryPrompt('u2')).toBe('')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd server && npx vitest run src/__tests__/memory.service.test.ts`
Expected: FAIL（`memory.service.ts` 不存在）。

- [ ] **Step 3: 创建 `server/src/services/wechat/memory.service.ts` 核心部分**

```ts
import { connectDatabase } from '../../database/index.js'
import { getSettingValue } from '../../settings.service.js'

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

/** 把 UTC 时刻偏移为"北京墙钟时间"的 Date，用 getUTC* 读取即得北京时间各分量。 */
function toBeijing(now: Date): Date {
  return new Date(now.getTime() + BEIJING_OFFSET_MS)
}

/** 北京日期 YYYY-MM-DD。 */
export function getMemoryDate(now: Date): string {
  const b = toBeijing(now)
  const y = b.getUTCFullYear()
  const m = String(b.getUTCMonth() + 1).padStart(2, '0')
  const d = String(b.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 每晚 00:30（北京时间）到点判定；分钟放宽到 <=1 容忍调度漂移（与报告一致）。 */
export function isMemoryDue(now: Date): boolean {
  const b = toBeijing(now)
  return b.getUTCHours() === 0 && b.getUTCMinutes() <= 1
}

export interface MemoryRow {
  id: number
  user_id: string
  content: string
  memory_date: string
  created_at: string
}

/** 落一条记忆；UNIQUE(user_id, content) 去重。返回新插入的 id，重复返回 0。 */
export function saveMemory(userId: string, content: string, memoryDate: string): number {
  const db = connectDatabase()
  const result = db.prepare(
    `INSERT OR IGNORE INTO wechat_memories (user_id, content, memory_date) VALUES (?, ?, ?)`
  ).run(userId, content, memoryDate)
  return Number(result.lastInsertRowid) || 0
}

/** 查询某用户记忆。days=近 N 天（含当天），按 memory_date DESC, id DESC。 */
export function queryMemories(
  userId: string,
  opts?: { days?: number; limit?: number }
): MemoryRow[] {
  const db = connectDatabase()
  const days = opts?.days ?? 30
  const limit = opts?.limit ?? 200
  const since = getMemoryDate(new Date(Date.now() - (days - 1) * 86400000))
  return db.prepare(
    `SELECT * FROM wechat_memories
     WHERE user_id = ? AND memory_date >= ?
     ORDER BY memory_date DESC, id DESC
     LIMIT ?`
  ).all(userId, since, limit) as MemoryRow[]
}

/** 关键词检索（数据库）。 */
export function searchMemories(
  query: string,
  opts?: { userId?: string; limit?: number }
): MemoryRow[] {
  const db = connectDatabase()
  const limit = opts?.limit ?? 10
  const conditions: string[] = ['instr(content, ?) > 0']
  const values: Array<string | number> = [query]
  if (opts?.userId) { conditions.push('user_id = ?'); values.push(opts.userId) }
  values.push(limit)
  return db.prepare(
    `SELECT * FROM wechat_memories WHERE ${conditions.join(' AND ')}
     ORDER BY memory_date DESC, id DESC LIMIT ?`
  ).all(...values) as MemoryRow[]
}

/** 解析 LLM 抽取输出为条目：兼容 - / * / 数字 / 普通行，过滤空行、过短行、标题行与"无"。 */
export function parseMemoryItems(text: string): string[] {
  return text.split('\n')
    .map(line => line.trim().replace(/^[-*•]\s+/, '').replace(/^\d+[.、]\s*/, ''))
    .filter(line => line.length >= 2 && !/^#{1,6}\s/.test(line) && !['无', 'none', 'None'].includes(line))
}

/** 近30天记忆附记段（system prompt 用）；无记忆返回 ''。 */
export function buildMemoryPrompt(userId: string): string {
  const maxItems = getSettingValue<number>('ilink_memory_prompt_max_items', 0)
  const limit = maxItems > 0 ? maxItems : 500
  const items = queryMemories(userId, { days: 30, limit })
  if (items.length === 0) return ''
  const lines = items.map(m => `- ${m.memory_date.slice(5)}: ${m.content}`)
  return [
    '## 记忆（近30天）',
    `当前用户微信ID：${userId}`,
    ...lines,
    '检索记忆时请使用 search_memory / search_memory_vectors 工具并传入当前用户微信ID。'
  ].join('\n')
}
```

- [ ] **Step 4: 追加 `DEFAULT_MEMORY_SYSTEM_PROMPT` 到 `server/src/services/prompt-defaults.ts`**

```ts
export const DEFAULT_MEMORY_SYSTEM_PROMPT =
  '你是一个记忆整理助手。请从对话中抽取值得长期记住的信息，包括：用户的个人信息、偏好、正在进行的项目/任务、做出的承诺、重要事件等。\n\n' +
  '## 输出要求\n' +
  '- 每条记忆占一行，以 "- " 开头。\n' +
  '- 只输出抽取出的记忆条目，不要输出任何解释、标题或序号。\n' +
  '- 每条记忆是一句完整、独立、可检索的话（如「用户喝美式咖啡不加糖」）。\n' +
  '- 只基于对话内容抽取，不得编造或推断。\n' +
  '- 如果今天没有值得长期记住的内容，只输出一行：无。\n' +
  '- 这是纯抽取任务，不要调用任何工具。'
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd server && npx vitest run src/__tests__/memory.service.test.ts`
Expected: PASS（7 个 describe 下全部用例）。

- [ ] **Step 6: typecheck**

Run: `cd server && npm run typecheck`
Expected: 通过。

- [ ] **Step 7: 提交**

```bash
git add server/src/services/wechat/memory.service.ts server/src/services/prompt-defaults.ts server/src/__tests__/memory.service.test.ts
git commit -m "feat: 记忆服务核心——到点判定/落库/近30天附记/条目解析 + 默认抽取 prompt"
```

---

### Task 4: memory.service 整理与调度 + 向量检索

**Files:**
- Modify: `server/src/services/wechat/memory.service.ts`（追加整理/调度/向量检索）
- Modify: `server/src/__tests__/memory.service.test.ts`（追加整理测试）

**Interfaces:**
- Consumes: `getReportWindow`、`queryChatRecords`、`buildTranscript`、`getWeChatUsers`（report.service，Task 1 已导出）、`DEFAULT_MEMORY_SYSTEM_PROMPT`（Task 3）、`embedText`（embedding-client）、`upsertChunks`/`searchChunks`（vector.service，Task 2）、动态 `runAgentTurn`/`formatBeijingTime`（ilink-bot.service）
- Produces: `consolidateDayMemory(userId): Promise<{ extracted: number; saved: number }>`、`searchMemoryVectors(query, opts?): Promise<Array<{ memory_id; content; memory_date; score }>>`、`checkAndConsolidateMemories(): Promise<void>`、`startMemoryService(): void`、`stopMemoryService(): void`（Task 6 消费）

- [ ] **Step 1: 在测试文件顶部追加 ilink-bot / embedding / vector mock**

`server/src/__tests__/memory.service.test.ts` 顶部（现有 `vi.mock('../database/index.js', ...)` 之后）追加：

```ts
// Task 4：mock ilink-bot 的动态 import（consolidateDayMemory 内部运行时 await import()）
vi.doMock('../services/wechat/ilink-bot.service.js', () => ({
  runAgentTurn: vi.fn(async () => '- 用户喜欢喝美式\n- 项目A正在开发'),
  formatBeijingTime: vi.fn(() => '[2026-08-02 00:30:00 星期日 北京时间]')
}))

vi.mock('../services/ai/embedding-client.js', () => ({
  embedText: vi.fn(async () => [0.1, 0.2, 0.3])
}))
vi.mock('../services/vector/vector.service.js', () => ({
  upsertChunks: vi.fn(async () => ({ success: true, count: 1 })),
  searchChunks: vi.fn(async () => [])
}))
```

- [ ] **Step 2: 追加失败测试（整理 + 向量检索）**

`server/src/__tests__/memory.service.test.ts` 追加：

```ts
import { consolidateDayMemory, searchMemoryVectors } from '../services/wechat/memory.service.js'

describe('consolidateDayMemory', () => {
  it('抽取→落库→向量入库，二次整理同内容去重', async () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM wechat_messages').run()
    db.prepare('DELETE FROM wechat_memories').run()
    db.prepare("INSERT INTO wechat_messages (user_id, role, content, created_at) VALUES ('u1','user','今天聊了项目A',?)")
      .run(new Date().toISOString())

    const { upsertChunks } = await import('../services/vector/vector.service.js')
    const first = await consolidateDayMemory('u1')
    expect(first.saved).toBe(2) // mock 输出两条
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_memories').get()).toMatchObject({ c: 2 })
    expect(upsertChunks).toHaveBeenCalledTimes(2)
    expect(upsertChunks).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: expect.stringMatching(/^mem\d+$/) })]),
      'oneplace_memory'
    )

    const second = await consolidateDayMemory('u1')
    expect(second.saved).toBe(0)
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_memories').get()).toMatchObject({ c: 2 })
  })

  it('当天无记录时跳过，不调用 LLM', async () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM wechat_messages').run()
    db.prepare("INSERT INTO wechat_messages (user_id, role, content, created_at) VALUES ('u1','user','昨天的事',?)")
      .run(new Date(Date.now() - 26 * 3600 * 1000).toISOString()) // 窗口外

    const { runAgentTurn } = await import('../services/wechat/ilink-bot.service.js')
    const res = await consolidateDayMemory('u1')
    expect(res.saved).toBe(0)
    expect(runAgentTurn).not.toHaveBeenCalled()
  })
})

describe('searchMemoryVectors', () => {
  it('映射 Qdrant payload', async () => {
    const { searchChunks } = await import('../services/vector/vector.service.js')
    ;(searchChunks as any).mockResolvedValueOnce([
      { id: 'mem1', score: 0.9, payload: { memory_id: 1, content: '用户喝美式', memory_date: '2026-08-01', user_id: 'u1' } }
    ])
    const res = await searchMemoryVectors('美式', { userId: 'u1' })
    expect(res[0]).toMatchObject({ memory_id: 1, content: '用户喝美式', memory_date: '2026-08-01', score: 0.9 })
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd server && npx vitest run src/__tests__/memory.service.test.ts`
Expected: FAIL（`consolidateDayMemory`/`searchMemoryVectors` 不存在）。

- [ ] **Step 4: 追加 `memory.service.ts` 整理 + 向量 + 调度实现**

`server/src/services/wechat/memory.service.ts` 顶部追加 import（放在现有 import 之后）：

```ts
import { getReportWindow, queryChatRecords, buildTranscript, getWeChatUsers } from './report.service.js'
import { DEFAULT_MEMORY_SYSTEM_PROMPT } from '../prompt-defaults.js'
import { embedText } from '../ai/embedding-client.js'
import { upsertChunks, searchChunks } from '../vector/vector.service.js'
```

文件末尾追加：

```ts
// ── 向量存取 ──────────────────────────────────────────────

/** 记忆向量库 collection 名（独立于笔记知识库）。 */
function getMemoryCollection(): string {
  return getSettingValue<string>('qdrant_memory_collection', 'oneplace_memory')
}

/** 给单条记忆条目 embedding 并写入记忆向量库。 */
async function upsertMemoryVector(userId: string, memoryId: number, content: string, memoryDate: string): Promise<void> {
  const provider = getSettingValue<string>('embedding_provider', 'qwen')
  const model = getSettingValue<string>('embedding_model', 'text-embedding-v4')
  const vector = await embedText(content, provider, model)
  const result = await upsertChunks([{
    id: `mem${memoryId}`,
    vector,
    content,
    metadata: { memory_id: memoryId, user_id: userId, memory_date: memoryDate }
  }], getMemoryCollection())
  if (!result.success) throw new Error(result.error || 'memory vector upsert failed')
}

/** 语义检索记忆向量库；失败返回空数组（不阻断对话）。 */
export async function searchMemoryVectors(
  query: string,
  opts?: { userId?: string; limit?: number }
): Promise<Array<{ memory_id: number; content: string; memory_date: string; score: number }>> {
  try {
    const provider = getSettingValue<string>('embedding_provider', 'qwen')
    const model = getSettingValue<string>('embedding_model', 'text-embedding-v4')
    const queryVector = await embedText(query, provider, model)
    const filter = opts?.userId ? { must: [{ key: 'user_id', match: { value: opts.userId } }] } : undefined
    const results = await searchChunks(queryVector, opts?.limit ?? 5, { collection: getMemoryCollection(), filter })
    return results.map(r => {
      const p = r.payload as { memory_id?: number; content?: string; memory_date?: string }
      return {
        memory_id: p.memory_id ?? 0,
        content: p.content ?? '',
        memory_date: p.memory_date ?? '',
        score: r.score
      }
    })
  } catch (err) {
    console.error('[memory] vector search failed:', err)
    return []
  }
}

// ── 每晚整理 ──────────────────────────────────────────────

/** 内存级 in-flight 锁：同一用户同时只允许一个整理在跑。 */
const inflightMemories = new Set<string>()

/** 整理某用户当天对话：抽取记忆条目→落库→新增条目写入向量库。静默执行，不发送微信消息。 */
export async function consolidateDayMemory(userId: string): Promise<{ extracted: number; saved: number }> {
  const now = new Date()
  const memoryDate = getMemoryDate(now)
  const window = getReportWindow('daily', now)
  const records = queryChatRecords(userId, window)
  if (records.length === 0) {
    console.log(`[memory] no messages today for ${userId}, skip`)
    return { extracted: 0, saved: 0 }
  }

  const recentMemories = queryMemories(userId, { days: 30, limit: 500 })
  const { runAgentTurn, formatBeijingTime } = await import('./ilink-bot.service.js')
  const userContent = [
    formatBeijingTime(),
    `请整理今日（${memoryDate}）的对话记忆。`,
    `今日共 ${records.length} 条聊天记录：`,
    buildTranscript(records),
    recentMemories.length > 0
      ? `\n以下为已有记忆，请勿重复抽取：\n${recentMemories.map(m => `- ${m.content}`).join('\n')}`
      : ''
  ].join('\n')

  const output = await runAgentTurn({
    userId,
    agentId: `memory:consolidate:${userId}`,
    systemPrompt: DEFAULT_MEMORY_SYSTEM_PROMPT,
    userContent,
    removeAfterRun: true,
    loadHistory: false
  })

  const items = parseMemoryItems(output)
  let saved = 0
  for (const content of items) {
    const id = saveMemory(userId, content, memoryDate)
    if (id === 0) continue
    saved++
    try {
      await upsertMemoryVector(userId, id, content, memoryDate)
    } catch (err) {
      console.error(`[memory] vector upsert failed for memory #${id}:`, err)
    }
  }
  console.log(`[memory] consolidated ${userId}: extracted=${items.length} saved=${saved}`)
  return { extracted: items.length, saved }
}

// ── 调度 ──────────────────────────────────────────────────

let memoryTimer: ReturnType<typeof setInterval> | null = null
let memoryInitTimer: ReturnType<typeof setTimeout> | null = null

/** 心跳：到点则遍历用户逐人整理（in-flight 锁防并发）。 */
export async function checkAndConsolidateMemories(): Promise<void> {
  if (!isMemoryDue(new Date())) return
  for (const userId of getWeChatUsers()) {
    if (inflightMemories.has(userId)) continue
    inflightMemories.add(userId)
    try {
      await consolidateDayMemory(userId)
    } catch (err) {
      console.error(`[memory] consolidate failed for ${userId}:`, err)
    } finally {
      inflightMemories.delete(userId)
    }
  }
}

export function startMemoryService(): void {
  if (memoryTimer) return
  console.log('[memory] starting memory service')
  memoryInitTimer = setTimeout(() => { memoryInitTimer = null; checkAndConsolidateMemories() }, 30000)
  memoryTimer = setInterval(checkAndConsolidateMemories, 60 * 1000)
}

export function stopMemoryService(): void {
  if (memoryInitTimer) { clearTimeout(memoryInitTimer); memoryInitTimer = null }
  if (memoryTimer) { clearInterval(memoryTimer); memoryTimer = null }
  console.log('[memory] service stopped')
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd server && npx vitest run src/__tests__/memory.service.test.ts`
Expected: PASS（核心 + 整理 + 向量检索全部用例）。

- [ ] **Step 6: typecheck**

Run: `cd server && npm run typecheck`
Expected: 通过。

- [ ] **Step 7: 提交**

```bash
git add server/src/services/wechat/memory.service.ts server/src/__tests__/memory.service.test.ts
git commit -m "feat: 记忆每晚整理与调度 + 记忆向量检索"
```

---

### Task 5: 内置记忆检索工具

**Files:**
- Modify: `server/src/services/ai/builtin-tools.ts`

**Interfaces:**
- Consumes: `searchMemories`、`searchMemoryVectors`（memory.service，Task 3/4）
- Produces: 两个 AgentTool（`search_memory`、`search_memory_vectors`），随 `getBuiltinToolMap()` 供 `loadToolsFromDb()` 匹配（工具记录已由 Task 1 迁移 025 种子）

- [ ] **Step 1: 添加 import**

`server/src/services/ai/builtin-tools.ts` 顶部（在现有 import 之后）：

```ts
import { searchMemories, searchMemoryVectors } from '../wechat/memory.service.js'
```

- [ ] **Step 2: 追加两个工具定义**

在 `getBuiltinToolMap` 数组末尾（`get_current_time` 之后）追加：

```ts
    // ── 14. 搜索记忆（数据库）──
    {
      name: 'search_memory',
      label: '搜索记忆',
      description: '在微信 Bot 的长期记忆库中按关键词检索，返回相关的记忆条目。用于回忆过往对话中提到的事实、偏好或事件。',
      parameters: Type.Object({
        query: Type.String({ description: '搜索关键词' }),
        limit: Type.Optional(Type.Number({ description: '返回数量，默认 10', default: 10 })),
        user_id: Type.Optional(Type.String({ description: '微信用户 ID（Bot 对话中通常提供）' }))
      }),
      execute: async (_toolCallId: string, params: { query: string; limit?: number; user_id?: string }) => {
        const rows = searchMemories(params.query, { userId: params.user_id, limit: params.limit })
        if (rows.length === 0) return textResult('未找到相关记忆')
        return textResult(rows.map(r => `- ${r.memory_date.slice(5)}: ${r.content}`).join('\n'))
      }
    },

    // ── 15. 语义搜索记忆（向量）──
    {
      name: 'search_memory_vectors',
      label: '语义搜索记忆',
      description: '在微信 Bot 的长期记忆向量库中按语义相似度检索，返回相关的记忆条目。用于模糊回忆、语义相关的历史信息。',
      parameters: Type.Object({
        query: Type.String({ description: '搜索关键词或描述' }),
        limit: Type.Optional(Type.Number({ description: '返回数量，默认 5', default: 5 })),
        user_id: Type.Optional(Type.String({ description: '微信用户 ID（Bot 对话中通常提供）' }))
      }),
      execute: async (_toolCallId: string, params: { query: string; limit?: number; user_id?: string }) => {
        const results = await searchMemoryVectors(params.query, { userId: params.user_id, limit: params.limit })
        if (results.length === 0) return textResult('未找到相关记忆')
        return textResult(results.map((r, i) => `[${i + 1}] (相关度: ${(r.score * 100).toFixed(0)}%)\n- ${r.memory_date.slice(5)}: ${r.content}`).join('\n\n---\n\n'))
      }
    }
```

- [ ] **Step 3: 验证工具注册与既有测试无回归**

Run:
```bash
cd server && npx tsx -e "
import { getBuiltinToolMap } from './src/services/ai/builtin-tools.js';
const m = getBuiltinToolMap();
console.log('has search_memory:', m.has('search_memory'));
console.log('has search_memory_vectors:', m.has('search_memory_vectors'));
console.log('total tools:', m.size);
"
```
Expected: 两个工具均为 true，总数 15。
Run: `cd server && npx vitest run`  → 既有测试全绿。

- [ ] **Step 4: typecheck + build**

Run: `cd server && npm run typecheck && npm run build`
Expected: 通过。

- [ ] **Step 5: 提交**

```bash
git add server/src/services/ai/builtin-tools.ts
git commit -m "feat: 内置记忆检索工具 search_memory / search_memory_vectors"
```

---

### Task 6: ilink-bot 接线 — 对话附记 + 记忆服务启停

**Files:**
- Modify: `server/src/services/wechat/ilink-bot.service.ts`

**Interfaces:**
- Consumes: `buildMemoryPrompt`、`startMemoryService`、`stopMemoryService`（memory.service）
- Produces: 无（bot 运行时行为）

- [ ] **Step 1: 添加 import**

`server/src/services/wechat/ilink-bot.service.ts` 顶部（report.service import 之后）：

```ts
import { startMemoryService, stopMemoryService, buildMemoryPrompt } from './memory.service.js'
```

- [ ] **Step 2: onMessage 组装 effectivePrompt 时追加记忆段**

`ilink-bot.service.ts` 中 onMessage 内（约第 393-394 行）：

```ts
        const basePrompt = userMode?.mode === 'learning'
          ? getLearningPrompt(userMode.learningTopic)
          : [config.system_prompt, noteToolsPrompt].filter(Boolean).join('\n\n')
        const memoryPrompt = buildMemoryPrompt(msg.userId)
        const effectivePrompt = basePrompt + (skillPrompt ? '\n\n' + skillPrompt : '') + (memoryPrompt ? '\n\n' + memoryPrompt : '')
```

- [ ] **Step 3: 登录成功 2s 后启动记忆服务**

`ilink-bot.service.ts` 登录成功 setTimeout 回调内（`startReportService()` 之后）：

```ts
            // 启动报告服务
            setReportBot(bot!)
            startReportService()
            console.log('[ilink] report service started')

            // 启动记忆服务（每晚整理当天对话）
            startMemoryService()
            console.log('[ilink] memory service started')
```

- [ ] **Step 4: stop 时停止记忆服务**

`stopILinkBot()` 内（`stopReportService()` 之后）：

```ts
    // 停止报告服务
    stopReportService()

    // 停止记忆服务
    stopMemoryService()
```

- [ ] **Step 5: typecheck + build**

Run: `cd server && npm run typecheck && npm run build`
Expected: 通过，无循环依赖报错（memory.service 对 ilink-bot 是运行时动态 import）。

- [ ] **Step 6: 提交**

```bash
git add server/src/services/wechat/ilink-bot.service.ts
git commit -m "feat: bot 对话附带近30天记忆 + 启动/停止记忆整理服务"
```

---

### Task 7: 全量验证

- [ ] **Step 1: 后端全量测试**

Run: `cd server && npm test`
Expected: 全部通过（含新增 vector/memory 测试与既有 19 例 report 测试）。

- [ ] **Step 2: 前后端 typecheck + build**

Run: `cd server && npm run typecheck && npm run build`，再 `cd .. && npm run typecheck`
Expected: 全部通过。

- [ ] **Step 3: 冒烟（迁移幂等性）**

Run:
```bash
cd server && npx tsx -e "
import Database from 'better-sqlite3';
import { runMigrations } from './src/database/migrate.js';
const db = new Database(':memory:');
runMigrations(db); runMigrations(db); // 跑两次验证幂等
console.log('migrations idempotent ok, memory tables/tools/settings present:',
  db.prepare(\"SELECT COUNT(*) c FROM sqlite_master WHERE name='wechat_memories'\").get(),
  db.prepare(\"SELECT COUNT(*) c FROM tools WHERE name LIKE 'search_memory%'\").get(),
  db.prepare(\"SELECT COUNT(*) c FROM settings WHERE key IN ('qdrant_memory_collection','ilink_memory_prompt_max_items')\").get());
"
```
Expected: 输出 1 / 2 / 2，无报错。

- [ ] **Step 4: 更新 `docs/memory/known-issues.md` 如需要**（仅当出现需记录的问题；否则跳过）。

- [ ] **Step 5: 提交收尾**

```bash
git status
```
确认工作区干净（如 known-issues 有改动则一并提交）。
