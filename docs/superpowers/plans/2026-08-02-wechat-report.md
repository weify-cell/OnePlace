# 微信日报/周报/月报 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为微信 Bot 增加按聊天记录生成日报/周报/月报的能力（定时 + 命令触发），入库并提供 Web 页面独立查询与下钻。

**Architecture:** 新建 `report.service.ts`（1 分钟 setInterval 心跳 + 北京时区到点判定，无防重发守卫）；复用 `runAgentTurn` 完整 agent loop（新增 `loadHistory:false` 参数避免重复灌历史）；报告写入 `wechat_reports` 表；`/reports` Web 页通过控制器/路由查询并支持 月报→周报→日报 下钻。整体复用 `proactive-chat.service.ts` 的服务模式，不引新依赖。

**Tech Stack:** Express + better-sqlite3（后端）、Vue 3 + Naive UI + marked（前端）、Vitest（测试）、`Intl`/UTC 偏移做北京时区运算（无需时区库）。

## Global Constraints

- 全仓 ESM：server 端本地相对导入必须带 `.js` 后缀（如 `from './report.service.js'`）。
- 迁移编号顺延：下一个是 `023`（018 被有意跳过，勿补号）。
- 代码以中文注释/日志为主。
- 不引入新 npm 依赖（不用 cron 库）。
- 不加防重发守卫；报告生成失败不落表。
- 时间一律存 UTC ISO8601（`strftime('%Y-%m-%dT%H:%M:%fZ','now')` 格式），显示时前端转北京时区。
- 不修改 `wechat_messages` 的 100 条上限。

---

### Task 1: 迁移 023 + 报告 prompt 常量

**Files:**
- Create: `server/src/database/migrations/023_wechat_reports.sql`
- Modify: `server/src/services/prompt-defaults.ts`

**Interfaces:**
- Produces: `wechat_reports` 表（含 UNIQUE 兜底 + 索引）；`DEFAULT_REPORT_SYSTEM_PROMPT`（含 `{type}` 占位，调用方用中文标签替换）。

- [ ] **Step 1: 创建迁移文件**

`server/src/database/migrations/023_wechat_reports.sql`:

```sql
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
```

- [ ] **Step 2: 在 prompt-defaults.ts 末尾追加报告 prompt**

`server/src/services/prompt-defaults.ts`（在 `DEFAULT_PROACTIVE_USER_MESSAGE` 之后）:

```ts
export const DEFAULT_REPORT_SYSTEM_PROMPT =
  '你是一个擅长总结归纳的微信助手，请根据聊天记录生成{type}报告。\n\n' +
  '## 要求\n' +
  '- 只基于提供的聊天记录总结，不得编造或推断记录之外的内容。\n' +
  '- 使用 markdown 分点式结构：先一句话概述，再按主题分点，最后给出「要点与建议」。\n' +
  '- 控制在 400 字以内，中文输出。\n' +
  '- 这是纯总结任务，不要调用任何工具。'
```

- [ ] **Step 3: 验证迁移可执行**

Run:
```bash
cd /Users/a99/Documents/WorkSpace/code/OnePlace/server
cp ../data/oneplace.db /tmp/023-test.db
sqlite3 /tmp/023-test.db < src/database/migrations/023_wechat_reports.sql
sqlite3 /tmp/023-test.db ".schema wechat_reports"
rm /tmp/023-test.db
```
Expected: 打印出包含 `UNIQUE(user_id, report_type, period_start)` 的 `wechat_reports` 表结构，无报错。

- [ ] **Step 4: Commit**

```bash
git add server/src/database/migrations/023_wechat_reports.sql server/src/services/prompt-defaults.ts
git commit -m "feat: wechat_reports 表迁移 + 报告 prompt 常量"
```

---

### Task 2: report.service — 北京时区窗口与调度纯函数

**Files:**
- Create: `server/src/services/wechat/report.service.ts`
- Test: `server/src/__tests__/report.service.test.ts`

**Interfaces:**
- Consumes: 无（纯函数，不依赖 DB/bot）。
- Produces:
  - `export type ReportType = 'daily' | 'weekly' | 'monthly'`
  - `export function getReportWindow(type: ReportType, now: Date): { start: string; end: string }` — 返回 UTC ISO 字符串
  - `export function isReportDue(type: ReportType, now: Date): boolean`
  - `export function getReportTypeLabel(type: ReportType): string` — '日报'/'周报'/'月报'

- [ ] **Step 1: 写测试（窗口 + 到点判定）**

`server/src/__tests__/report.service.test.ts`（本任务先只测纯函数，后续任务往同一文件追加用例）:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  getReportWindow,
  getReportTypeLabel,
  isReportDue,
  type ReportType
} from '../services/wechat/report.service.js'

// 北京 = UTC+8。以下 now 均为 UTC 时刻，注释标明对应北京时间。
const DAILY_DUE = new Date('2026-08-02T14:00:00.000Z')   // 北京 2026-08-02 22:00
const DAILY_OFF = new Date('2026-08-02T14:05:00.000Z')   // 北京 2026-08-02 22:05
const SUNDAY_830 = new Date('2026-08-02T00:30:00.000Z')  // 北京 2026-08-02(周日) 08:30
const SUNDAY_800 = new Date('2026-08-02T00:00:00.000Z')  // 北京 2026-08-02(周日) 08:00
const MONDAY_800 = new Date('2026-08-03T00:00:00.000Z')  // 北京 2026-08-03(周一) 08:00
const LAST_DAY_800 = new Date('2026-08-31T00:00:00.000Z') // 北京 2026-08-31 08:00（8月最后一天）
const NOT_LAST_800 = new Date('2026-08-30T00:00:00.000Z') // 北京 2026-08-30 08:00

describe('isReportDue', () => {
  it('日报：每天 22:00 到点', () => {
    expect(isReportDue('daily', DAILY_DUE)).toBe(true)
    expect(isReportDue('daily', DAILY_OFF)).toBe(false)
  })
  it('周报：仅周日 8:00 到点', () => {
    expect(isReportDue('weekly', SUNDAY_800)).toBe(true)
    expect(isReportDue('weekly', SUNDAY_830)).toBe(false)
    expect(isReportDue('weekly', MONDAY_800)).toBe(false)
  })
  it('月报：仅每月最后一天 8:00 到点', () => {
    expect(isReportDue('monthly', LAST_DAY_800)).toBe(true)
    expect(isReportDue('monthly', NOT_LAST_800)).toBe(false)
  })
})

describe('getReportWindow', () => {
  it('日报窗口：当天北京 00:00 起，到 now', () => {
    const w = getReportWindow('daily', DAILY_DUE)
    expect(w.start).toBe('2026-08-01T16:00:00.000Z') // 北京 8-02 00:00
    expect(w.end).toBe('2026-08-02T14:00:00.000Z')
  })
  it('周报窗口：本周一北京 00:00 起', () => {
    const w = getReportWindow('weekly', SUNDAY_800)
    expect(w.start).toBe('2026-07-26T16:00:00.000Z') // 北京 7-27(周一) 00:00
    expect(w.end).toBe('2026-08-02T00:00:00.000Z')
  })
  it('月报窗口：本月 1 日北京 00:00 起', () => {
    const w = getReportWindow('monthly', LAST_DAY_800)
    expect(w.start).toBe('2026-07-31T16:00:00.000Z') // 北京 8-01 00:00
    expect(w.end).toBe('2026-08-31T00:00:00.000Z')
  })
  it('跨月最后一天的月报窗口正确', () => {
    const w = getReportWindow('monthly', new Date('2026-09-30T00:00:00.000Z')) // 北京 9-30 08:00
    expect(w.start).toBe('2026-08-31T16:00:00.000Z') // 北京 9-01 00:00
    expect(w.end).toBe('2026-09-30T00:00:00.000Z')
  })
})

describe('getReportTypeLabel', () => {
  it('返回中文标签', () => {
    expect(getReportTypeLabel('daily')).toBe('日报')
    expect(getReportTypeLabel('weekly')).toBe('周报')
    expect(getReportTypeLabel('monthly')).toBe('月报')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/a99/Documents/WorkSpace/code/OnePlace/server && npx vitest run src/__tests__/report.service.test.ts`
Expected: FAIL —— `Cannot find module '../services/wechat/report.service.js'`

- [ ] **Step 3: 创建 report.service.ts 并实现纯函数**

`server/src/services/wechat/report.service.ts`（本任务只含纯函数；后续任务追加内容）:

```ts
import { connectDatabase } from '../../database/index.js'

export type ReportType = 'daily' | 'weekly' | 'monthly'

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

/** 把 UTC 时刻偏移为"北京墙钟时间"的 Date，用 getUTC* 读取即得北京时间各分量。 */
function toBeijing(now: Date): Date {
  return new Date(now.getTime() + BEIJING_OFFSET_MS)
}

export function getReportTypeLabel(type: ReportType): string {
  return { daily: '日报', weekly: '周报', monthly: '月报' }[type]
}

/** 该周期内的最近一条已发报告是否跨天/跨周/跨月（用于调度到点判定，无状态守卫）。 */
function isLastDayOfBeijingMonth(now: Date): boolean {
  const b = toBeijing(now)
  const y = b.getUTCFullYear()
  const m = b.getUTCMonth()
  const d = b.getUTCDate()
  return new Date(Date.UTC(y, m, d + 1)).getUTCMonth() !== m
}

/** 到点判定（北京时间）。日报每天22:00；周报周日8:00；月报每月最后一天8:00。 */
export function isReportDue(type: ReportType, now: Date): boolean {
  const b = toBeijing(now)
  const hour = b.getUTCHours()
  const minute = b.getUTCMinutes()
  if (type === 'daily') return hour === 22 && minute === 0
  if (type === 'weekly') return b.getUTCDay() === 0 && hour === 8 && minute === 0
  // monthly
  return isLastDayOfBeijingMonth(now) && hour === 8 && minute === 0
}

/** 周期窗口。start 为北京 00:00 起（转 UTC），end 为 now。 */
export function getReportWindow(type: ReportType, now: Date): { start: string; end: string } {
  const b = toBeijing(now)
  const y = b.getUTCFullYear()
  const m = b.getUTCMonth()
  const d = b.getUTCDate()

  let startBeijingMs: number
  if (type === 'daily') {
    startBeijingMs = Date.UTC(y, m, d)
  } else if (type === 'weekly') {
    const daysSinceMonday = (b.getUTCDay() + 6) % 7
    startBeijingMs = Date.UTC(y, m, d - daysSinceMonday)
  } else {
    startBeijingMs = Date.UTC(y, m, 1)
  }
  const startUtc = new Date(startBeijingMs - BEIJING_OFFSET_MS).toISOString()
  return { start: startUtc, end: now.toISOString() }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/__tests__/report.service.test.ts`
Expected: PASS（窗口 + 到点 + 标签全部通过）。

- [ ] **Step 5: Commit**

```bash
git add server/src/services/wechat/report.service.ts server/src/__tests__/report.service.test.ts
git commit -m "feat: report.service 北京时区窗口与到点判定"
```

---

### Task 3: report.service — 聊天记录查询与报告落表

**Files:**
- Modify: `server/src/services/wechat/report.service.ts`
- Test: `server/src/__tests__/report.service.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `ReportType`、`getReportWindow`。
- Produces:
  - `export interface WeChatReportRow { id: number; user_id: string; report_type: ReportType; period_start: string; period_end: string; content: string; created_at: string }`
  - `export function queryChatRecords(userId: string, window: { start: string; end: string }): { role: string; content: string; created_at: string }[]`
  - `export function saveReport(userId: string, type: ReportType, window: { start: string; end: string }, content: string): void`
  - `export function listReports(params: { type?: ReportType; userId?: string; start?: string; end?: string }): WeChatReportRow[]`
  - `export function getReportById(id: number): WeChatReportRow | null`

- [ ] **Step 1: 追加测试（查询 + 落表 + 列表/详情）**

在 `server/src/__tests__/report.service.test.ts` 顶部加 DB mock，并追加 describe 块。

顶部加（现有 import 之后）:

```ts
import Database from 'better-sqlite3'

vi.mock('../database/index.js', () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE wechat_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      report_type TEXT NOT NULL CHECK(report_type IN ('daily','weekly','monthly')),
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, report_type, period_start)
    );
    CREATE TABLE wechat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `)
  return { connectDatabase: () => db }
})

import { queryChatRecords, saveReport, listReports, getReportById } from '../services/wechat/report.service.js'
```

追加 describe（完整块，数据经 `connectDatabase()` 注入）：

```ts
import { connectDatabase } from '../database/index.js'

describe('queryChatRecords', () => {
  it('按窗口过滤并返回角色/内容', () => {
    const db = connectDatabase()
    const ins = db.prepare('INSERT INTO wechat_messages (user_id, role, content, created_at) VALUES (?,?,?,?)')
    ins.run('u1', 'user', '今天聊了项目A', '2026-08-02T02:00:00.000Z')
    ins.run('u1', 'assistant', '好的，项目A进度如何', '2026-08-02T02:01:00.000Z')
    ins.run('u1', 'user', '这是窗口外消息', '2026-08-01T12:00:00.000Z')

    const rows = queryChatRecords('u1', { start: '2026-08-01T16:00:00.000Z', end: '2026-08-02T14:00:00.000Z' })
    expect(rows).toHaveLength(2)
    expect(rows[0].content).toBe('今天聊了项目A')
    expect(rows[1].role).toBe('assistant')
  })
})

describe('saveReport / listReports / getReportById', () => {
  it('落表后可按类型列表、详情查询，同周期重复插入幂等', () => {
    const db = connectDatabase()
    const w = { start: '2026-08-01T16:00:00.000Z', end: '2026-08-02T14:00:00.000Z' }
    saveReport('u1', 'daily', w, '日报内容A')
    saveReport('u1', 'daily', w, '日报内容B') // 同周期，应被 UNIQUE 忽略

    const all = listReports({ type: 'daily' })
    expect(all).toHaveLength(1)
    expect(all[0].content).toBe('日报内容A')

    const byRange = listReports({ type: 'weekly', start: '2026-07-26T16:00:00.000Z', end: '2026-08-02T00:00:00.000Z' })
    expect(byRange).toHaveLength(0)

    const detail = getReportById(all[0].id)
    expect(detail?.report_type).toBe('daily')
    expect(getReportById(9999)).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/__tests__/report.service.test.ts`
Expected: FAIL —— `queryChatRecords` 等未导出。

- [ ] **Step 3: 实现查询/落表/列表函数**

在 `report.service.ts` 追加：

```ts
export interface WeChatReportRow {
  id: number
  user_id: string
  report_type: ReportType
  period_start: string
  period_end: string
  content: string
  created_at: string
}

/** 查询窗口内的聊天记录（created_at 为 UTC，与窗口同为 ISO 字符串可直接比较）。 */
export function queryChatRecords(
  userId: string,
  window: { start: string; end: string }
): Array<{ role: string; content: string; created_at: string }> {
  const db = connectDatabase()
  return db.prepare(
    `SELECT role, content, created_at FROM wechat_messages
     WHERE user_id = ? AND created_at >= ? AND created_at < ?
     ORDER BY id ASC`
  ).all(userId, window.start, window.end) as Array<{ role: string; content: string; created_at: string }>
}

/** 落表，同周期重复由 UNIQUE + INSERT OR IGNORE 兜底。 */
export function saveReport(
  userId: string,
  type: ReportType,
  window: { start: string; end: string },
  content: string
): void {
  const db = connectDatabase()
  db.prepare(
    `INSERT OR IGNORE INTO wechat_reports (user_id, report_type, period_start, period_end, content)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, type, window.start, window.end, content)
}

/** 列表查询。start/end 用周期重叠语义过滤（period 与 [start,end) 有交集）。 */
export function listReports(params: {
  type?: ReportType
  userId?: string
  start?: string
  end?: string
}): WeChatReportRow[] {
  const db = connectDatabase()
  const conditions: string[] = []
  const values: Array<string | number> = []
  if (params.type) { conditions.push('report_type = ?'); values.push(params.type) }
  if (params.userId) { conditions.push('user_id = ?'); values.push(params.userId) }
  if (params.start) { conditions.push('period_end > ?'); values.push(params.start) }
  if (params.end) { conditions.push('period_start < ?'); values.push(params.end) }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return db.prepare(`SELECT * FROM wechat_reports ${where} ORDER BY period_start DESC`).all(...values) as WeChatReportRow[]
}

export function getReportById(id: number): WeChatReportRow | null {
  const db = connectDatabase()
  const row = db.prepare('SELECT * FROM wechat_reports WHERE id = ?').get(id) as WeChatReportRow | undefined
  return row ?? null
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/__tests__/report.service.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add server/src/services/wechat/report.service.ts server/src/__tests__/report.service.test.ts
git commit -m "feat: report.service 聊天记录查询与报告落表"
```

---

### Task 4: report.service — 生成与交付 + 调度 + 命令入口

**Files:**
- Modify: `server/src/services/wechat/report.service.ts`
- Modify: `server/src/services/wechat/ilink-bot.service.ts`（`runAgentTurn` 加 `loadHistory`）
- Test: `server/src/__tests__/report.service.test.ts`

**Interfaces:**
- Consumes: Task 2/3 的函数、`DEFAULT_REPORT_SYSTEM_PROMPT`、`runAgentTurn`/`formatBeijingTime`（运行时动态 import）、`WeChatBot`。
- Produces:
  - `export function setReportBot(bot: WeChatBot): void`
  - `export function startReportService(): void` / `export function stopReportService(): void`
  - `export async function generateReport(userId: string, type: ReportType): Promise<string>`
  - `export async function sendAndPersist(userId: string, type: ReportType): Promise<void>`
  - `export async function handleReportCommand(bot: WeChatBot, userId: string, type: ReportType): Promise<string>`

- [ ] **Step 1: 修改 runAgentTurn 支持 loadHistory:false**

`server/src/services/wechat/ilink-bot.service.ts` 的 `runAgentTurn` 签名与 getOrCreate（约 128-166 行）:

```ts
export async function runAgentTurn(opts: {
  userId: string
  agentId?: string
  systemPrompt: string
  userContent: string
  removeAfterRun?: boolean
  loadHistory?: boolean
}): Promise<string> {
  if (!agentPool) throw new Error('Agent pool not initialized')

  const agentId = opts.agentId ?? opts.userId
  const agent = agentPool.getOrCreate(agentId, () => {
    const history = opts.loadHistory === false ? [] : getMessageHistory(opts.userId)
    return convertMessages(history as ChatMessage[])
  })
  // ... 其余不变
```

- [ ] **Step 2: 追加测试（generateReport 构造 + sendAndPersist 交付）**

在 `report.service.test.ts` 追加（mock 掉 ilink-bot 的动态 import 与 bot）：

```ts
vi.doMock('../services/wechat/ilink-bot.service.js', () => ({
  runAgentTurn: vi.fn(async () => '【日报】今天聊了项目A…'),
  formatBeijingTime: vi.fn(() => '[2026-08-02 22:00:00 星期日 北京时间]')
}))

import { generateReport, sendAndPersist, handleReportCommand } from '../services/wechat/report.service.js'

describe('generateReport', () => {
  it('把转录文本与条数拼入 userContent 并返回总结与窗口', async () => {
    const result = await generateReport('u1', 'daily')
    expect(result.content).toContain('【日报】')
    expect(result.window.start).toMatch(/Z$/)
  })
})

describe('sendAndPersist', () => {
  it('发送成功则落表；失败则不落表', async () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM wechat_reports').run()

    const send = vi.fn().mockResolvedValue(undefined)
    await sendAndPersist('u1', 'daily', send as any)
    expect(send).toHaveBeenCalledTimes(1)
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_reports').get()).toMatchObject({ c: 1 })

    // 同周期再触发：UNIQUE 忽略，仍 1 条
    await sendAndPersist('u1', 'daily', send as any)
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_reports').get()).toMatchObject({ c: 1 })

    // 发送失败：不落表
    const badSend = vi.fn().mockRejectedValue(new Error('send fail'))
    await sendAndPersist('u1', 'weekly', badSend as any)
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_reports WHERE report_type=\'weekly\'').get()).toMatchObject({ c: 0 })
  })
})
```

> 注意：`vi.doMock` 必须在 import report.service 之前调用，且 `generateReport` 内部对 ilink-bot 使用**动态 import**，故需在用例里 `await import(...)` 后模块已生效。若 doMock 时序问题导致动态 import 拿到真实模块，可改为 vi.mock（顶层）。

- [ ] **Step 3: 实现生成/交付/调度/命令函数**

在 `report.service.ts` 追加：

```ts
import { WeChatBot } from '@wechatbot/wechatbot'
import { getSettingValue } from '../settings.service.js'
import { DEFAULT_REPORT_SYSTEM_PROMPT } from '../prompt-defaults.js'

let reportBot: WeChatBot | null = null
let reportTimer: ReturnType<typeof setInterval> | null = null
let reportInitTimer: ReturnType<typeof setTimeout> | null = null

export function setReportBot(bot: WeChatBot): void {
  reportBot = bot
}

function getWeChatUsers(): string[] {
  const db = connectDatabase()
  const rows = db.prepare(
    `SELECT DISTINCT key as userId FROM settings WHERE key LIKE 'ilink_user_%' LIMIT 10`
  ).all() as Array<{ userId: string }>
  return rows.map(r => r.userId.replace('ilink_user_', ''))
}

/** 组转录文本：每行 "user/assistant: 内容"。 */
function buildTranscript(rows: Array<{ role: string; content: string }>): string {
  return rows.map(r => `${r.role === 'user' ? '用户' : '助手'}: ${r.content}`).join('\n')
}

/** 生成一份报告（完整 agent loop，独立 agentId，不加载用户历史）。 */
export async function generateReport(
  userId: string,
  type: ReportType,
  window?: { start: string; end: string }
): Promise<{ content: string; window: { start: string; end: string } }> {
  const w = window ?? getReportWindow(type, new Date())
  const records = queryChatRecords(userId, w)
  const { runAgentTurn, formatBeijingTime } = await import('./ilink-bot.service.js')

  const typeLabel = getReportTypeLabel(type)
  const systemPrompt = DEFAULT_REPORT_SYSTEM_PROMPT.replace('{type}', typeLabel)
  const transcript = buildTranscript(records)
  const userContent = [
    formatBeijingTime(),
    `请生成${typeLabel}。`,
    `覆盖时间：${w.start} ~ ${w.end}（UTC）。`,
    `本次共 ${records.length} 条聊天记录${records.length === 0 ? '（该周期无聊天记录，请如实说明）' : ''}：`,
    transcript
  ].join('\n')

  const content = await runAgentTurn({
    userId,
    agentId: `report:${type}:${userId}`,
    systemPrompt,
    userContent,
    removeAfterRun: true,
    loadHistory: false,
  })
  return { content, window: w }
}

/** 生成并交付：成功→微信发送+落表；失败→兜底文案，不落表。 */
export async function sendAndPersist(
  userId: string,
  type: ReportType,
  sendFn: (userId: string, content: string) => Promise<unknown> = async (uid, c) => {
    if (!reportBot) throw new Error('bot not set')
    await reportBot.send(uid, c)
  }
): Promise<void> {
  const window = getReportWindow(type, new Date())
  try {
    const { content } = await generateReport(userId, type, window)
    await sendFn(userId, content)
    saveReport(userId, type, window, content)
    console.log(`[report] sent ${type} to ${userId}: ${content.slice(0, 40)}...`)
  } catch (error) {
    console.error(`[report] failed to generate/send ${type} for ${userId}:`, error)
    await sendFn(userId, `${getReportTypeLabel(type)}生成失败，请稍后再试。`).catch(() => {})
  }
}

/** 调度心跳：遍历用户，各类型到点即生成。无守卫。 */
export async function checkAndSendReports(): Promise<void> {
  if (!reportBot) return
  const now = new Date()
  const types: ReportType[] = ['daily', 'weekly', 'monthly']
  for (const userId of getWeChatUsers()) {
    for (const type of types) {
      if (isReportDue(type, now)) {
        await sendAndPersist(userId, type)
      }
    }
  }
}

export function startReportService(): void {
  if (reportTimer) return
  console.log('[report] starting report service')
  reportInitTimer = setTimeout(() => { reportInitTimer = null; checkAndSendReports() }, 30000)
  reportTimer = setInterval(checkAndSendReports, 60 * 1000)
}

export function stopReportService(): void {
  if (reportInitTimer) { clearTimeout(reportInitTimer); reportInitTimer = null }
  if (reportTimer) { clearInterval(reportTimer); reportTimer = null }
  reportBot = null
  console.log('[report] service stopped')
}

/** 命令入口：即时生成，回复并落表。 */
export async function handleReportCommand(
  bot: WeChatBot,
  userId: string,
  type: ReportType
): Promise<string> {
  const content = await generateReport(userId, type)
  const window = getReportWindow(type, new Date())
  saveReport(userId, type, window, content)
  await bot.send(userId, content)
  return content
}
```

> 说明：`sendAndPersist` 抽出可注入的 `sendFn` 是为了测试时可 mock 发送；`handleReportCommand` 由 ilink-bot 的命令处理器调用（传入 bot 实例与 userId）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/__tests__/report.service.test.ts`
Expected: PASS。若 Task 2 纯函数测试因顶层 `vi.doMock` 时序受影响，把 ilink-bot 的 mock 改为顶层 `vi.mock`。

- [ ] **Step 5: Commit**

```bash
git add server/src/services/wechat/report.service.ts server/src/services/wechat/ilink-bot.service.ts server/src/__tests__/report.service.test.ts
git commit -m "feat: report.service 生成/交付/调度/命令，runAgentTurn 支持 loadHistory"
```

---

### Task 5: ilink-bot 接线（命令解析 + 启动）

**Files:**
- Modify: `server/src/services/wechat/ilink-bot.service.ts`

**Interfaces:**
- Consumes: Task 4 的 `setReportBot` / `startReportService` / `stopReportService` / `handleReportCommand`。

- [ ] **Step 1: 导入 report 服务**

`server/src/services/wechat/ilink-bot.service.ts` 顶部 import（第 7 行 proactive 之后）:

```ts
import { setReportBot, startReportService, stopReportService, handleReportCommand } from './report.service.js'
```

- [ ] **Step 2: onMessage 增加命令解析**

在 `ilink-bot.service.ts` 的 `onMessage` 内、现有 `/清空上下文` 命令块之后（约 348 行）插入:

```ts
      // 命令解析：日报/周报/月报
      const reportMatch = msg.text?.trim().match(/^\/(日报|周报|月报)$/)
      if (reportMatch) {
        const typeMap: Record<string, 'daily' | 'weekly' | 'monthly'> = {
          '日报': 'daily', '周报': 'weekly', '月报': 'monthly'
        }
        const type = typeMap[reportMatch[1]]
        await bot!.reply(msg, `${reportMatch[1]}生成中，请稍候...`)
        try {
          const content = await handleReportCommand(bot!, msg.userId, type)
          await bot!.reply(msg, content)
        } catch (err) {
          console.error('[ilink] 生成报告失败:', err)
          await bot!.reply(msg, `${reportMatch[1]}生成失败，请稍后再试。`)
        }
        return
      }
```

> 注：`handleReportCommand` 只返回 content、内部不发送（见 Task 4 定义），发送统一由本处 `bot.reply` 完成，避免重复。

- [ ] **Step 3: 启动/停止接线**

登录成功回调里，现有 proactive 启动块之后（约 490 行）追加:

```ts
            // 启动报告服务
            setReportBot(bot!)
            startReportService()
            console.log('[ilink] report service started')
```

`stopILinkBot()` 内，`stopProactiveChatService()` 之后追加:

```ts
    stopReportService()
```

- [ ] **Step 4: 验证编译**

Run: `cd /Users/a99/Documents/WorkSpace/code/OnePlace/server && npm run typecheck`
Expected: PASS（无类型错误）。

- [ ] **Step 5: Commit**

```bash
git add server/src/services/wechat/ilink-bot.service.ts
git commit -m "feat: 微信 Bot 接入日报/周报/月报命令与定时服务"
```

---

### Task 6: 控制器与路由

**Files:**
- Modify: `server/src/controllers/ilink.controller.ts`
- Modify: `server/src/routes/ilink.routes.ts`

**Interfaces:**
- Consumes: Task 3 的 `listReports` / `getReportById`、`ReportType`。
- Produces: `GET /api/ilink/reports?type=&start=&end=`、`GET /api/ilink/reports/:id`。

- [ ] **Step 1: 控制器**

`server/src/controllers/ilink.controller.ts` 顶部 import 追加：

```ts
import * as reportService from '../services/wechat/report.service.js'
```

文件末尾追加：

```ts
export function getReports(req: Request, res: Response): void {
  const type = getSingleParam(req.query.type) as reportService.ReportType | undefined
  const start = getSingleParam(req.query.start)
  const end = getSingleParam(req.query.end)
  res.json(reportService.listReports({ type, start, end }))
}

export function getReport(req: Request, res: Response): void {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'BadRequest', message: 'id must be an integer' })
    return
  }
  const report = reportService.getReportById(id)
  if (!report) {
    res.status(404).json({ error: 'NotFound', message: 'report not found' })
    return
  }
  res.json(report)
}
```

- [ ] **Step 2: 路由**

`server/src/routes/ilink.routes.ts` 末尾追加：

```ts
// 报告查询
ilinkRouter.get('/reports', ilinkController.getReports)
ilinkRouter.get('/reports/:id', ilinkController.getReport)
```

- [ ] **Step 3: 验证编译**

Run: `npm run typecheck`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add server/src/controllers/ilink.controller.ts server/src/routes/ilink.routes.ts
git commit -m "feat: 微信报告列表/详情 API"
```

---

### Task 7: 前端 — ReportsView + 路由 + 侧边栏

**Files:**
- Create: `src/api/reports.api.ts`
- Create: `src/views/ReportsView.vue`
- Modify: `src/router/index.ts`
- Modify: `src/components/common/AppSidebar.vue`

**Interfaces:**
- Consumes: `GET /api/ilink/reports`、`GET /api/ilink/reports/:id`。
- Produces: 路由 `/reports`，侧边栏"报告"入口（📊）。

- [ ] **Step 1: 新建 API 模块**

`src/api/reports.api.ts`:

```ts
import { api } from './index'

export type ReportType = 'daily' | 'weekly' | 'monthly'

export interface WeChatReport {
  id: number
  user_id: string
  report_type: ReportType
  period_start: string
  period_end: string
  content: string
  created_at: string
}

export async function fetchReports(params: {
  type?: ReportType
  start?: string
  end?: string
}): Promise<WeChatReport[]> {
  const res = await api.get('/ilink/reports', { params })
  return res.data
}
```

- [ ] **Step 2: 新建视图**

`src/views/ReportsView.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchReports, type ReportType, type WeChatReport } from '@/api/reports.api'
import MarkdownPreview from '@/components/notes/MarkdownPreview.vue'

const typeOptions: Array<{ label: string; value: ReportType }> = [
  { label: '日报', value: 'daily' },
  { label: '周报', value: 'weekly' },
  { label: '月报', value: 'monthly' }
]

const activeType = ref<ReportType>('daily')
const reports = ref<WeChatReport[]>([])
const selected = ref<WeChatReport | null>(null)
const loading = ref(false)
// 下钻范围（父报告周期），空表示独立查询全部
const drillRange = ref<{ start: string; end: string } | null>(null)
const breadcrumb = ref<string[]>([])

function fmtBeijing(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}

function periodLabel(r: WeChatReport): string {
  const start = new Date(r.period_start).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const end = new Date(r.period_end).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
  const label = typeOptions.find(t => t.value === r.report_type)?.label || r.report_type
  return start === end ? `${label} ${start}` : `${label} ${start} ~ ${end}`
}

async function load() {
  loading.value = true
  try {
    reports.value = await fetchReports({
      type: activeType.value,
      ...(drillRange.value ? { start: drillRange.value.start, end: drillRange.value.end } : {})
    })
    selected.value = reports.value[0] ?? null
  } finally {
    loading.value = false
  }
}

function switchType(type: ReportType) {
  activeType.value = type
  drillRange.value = null
  breadcrumb.value = []
  load()
}

function select(r: WeChatReport) {
  selected.value = r
}

// 下钻：月报→周报 / 周报→日报
function drillDown(target: ReportType) {
  if (!selected.value) return
  drillRange.value = { start: selected.value.period_start, end: selected.value.period_end }
  breadcrumb.value = [periodLabel(selected.value)]
  activeType.value = target
  load()
}

function goUp() {
  breadcrumb.value = []
  drillRange.value = null
  load()
}

onMounted(load)
</script>

<template>
  <div class="reports-page">
    <div class="reports-tabs">
      <button
        v-for="opt in typeOptions" :key="opt.value"
        class="reports-tab" :class="{ 'reports-tab--active': activeType === opt.value }"
        @click="switchType(opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>

    <div v-if="breadcrumb.length" class="reports-breadcrumb">
      <span class="reports-breadcrumb__item">{{ breadcrumb[0] }}</span>
      <span class="reports-breadcrumb__arrow">›</span>
      <button class="reports-breadcrumb__up" @click="goUp">返回全部</button>
    </div>

    <div class="reports-layout">
      <aside class="reports-list">
        <div v-if="loading" class="reports-empty">加载中...</div>
        <button
          v-for="r in reports" :key="r.id"
          class="reports-item" :class="{ 'reports-item--active': selected?.id === r.id }"
          @click="select(r)"
        >
          <span class="reports-item__period">{{ periodLabel(r) }}</span>
        </button>
        <div v-if="!loading && reports.length === 0" class="reports-empty">暂无报告</div>
      </aside>

      <section class="reports-detail">
        <template v-if="selected">
          <div class="reports-detail__header">
            <h2 class="reports-detail__title">{{ periodLabel(selected) }}</h2>
            <div class="reports-detail__actions">
              <button v-if="activeType === 'monthly'" class="reports-btn" @click="drillDown('weekly')">查看本月周报</button>
              <button v-if="activeType === 'weekly'" class="reports-btn" @click="drillDown('daily')">查看本周日报</button>
            </div>
          </div>
          <MarkdownPreview :content="selected.content" />
        </template>
        <div v-else class="reports-empty">请选择左侧报告查看详情</div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.reports-page { padding: 24px; }
.reports-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.reports-tab { padding: 8px 20px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-card); cursor: pointer; }
.reports-tab--active { background: var(--accent-primary); color: #fff; border-color: var(--accent-primary); }
.reports-breadcrumb { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; color: var(--text-secondary); font-size: .875rem; }
.reports-layout { display: grid; grid-template-columns: 260px 1fr; gap: 16px; align-items: start; }
.reports-list { display: flex; flex-direction: column; gap: 6px; max-height: calc(100vh - 200px); overflow-y: auto; }
.reports-item { text-align: left; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-card); cursor: pointer; }
.reports-item--active { border-color: var(--accent-primary); }
.reports-detail { border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-card); overflow: hidden; }
.reports-detail__header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); }
.reports-detail__title { font-size: 1.0625rem; margin: 0; }
.reports-btn { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-subtle); background: transparent; cursor: pointer; }
.reports-empty { padding: 24px; text-align: center; color: var(--text-muted); }
</style>
```

- [ ] **Step 3: 注册路由**

`src/router/index.ts` 的 routes 数组中（`/skills-manager/:categoryId` 之后）追加：

```ts
    { path: '/reports', component: () => import('@/views/ReportsView.vue'), meta: { requiresAuth: true } },
```

- [ ] **Step 4: 侧边栏入口**

`src/components/common/AppSidebar.vue` 的 `navItems` 数组（`/chat` 之后）追加：

```ts
  { path: '/reports', label: '报告', icon: '📊' },
```

- [ ] **Step 5: 前端类型检查**

Run: `cd /Users/a99/Documents/WorkSpace/code/OnePlace && npm run typecheck`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/api/reports.api.ts src/views/ReportsView.vue src/router/index.ts src/components/common/AppSidebar.vue
git commit -m "feat: 微信报告查询页面与导航入口"
```

---

### Task 8: 全量校验与收尾

**Files:**
- 无新文件（验证 + 文档更新）。

- [ ] **Step 1: 后端测试全量**

Run: `cd /Users/a99/Documents/WorkSpace/code/OnePlace/server && npm test`
Expected: 除既有的 4 个 `vector.service.test.ts` 失败（Qdrant v1.x mock 不匹配，与本功能无关）外，其余全部 PASS。

- [ ] **Step 2: 前后端 typecheck**

Run: `npm run typecheck && cd server && npm run typecheck`
Expected: 均 PASS。

- [ ] **Step 3: 前端构建**

Run: `cd /Users/a99/Documents/WorkSpace/code/OnePlace && npm run build`
Expected: BUILD SUCCESS。

- [ ] **Step 4: 手动冒烟（可选，需 bot 在线）**

启动后端，`curl "http://localhost:3000/api/ilink/reports?type=daily"` 应返回数组（可能为空）。
若已有微信会话，发送 `/日报` 应收到报告并入库。

- [ ] **Step 5: 更新 docs/database-schema.md 补充 wechat_reports 表**

在 `docs/database-schema.md` 的 `## 15. _notes_old_*` 之后追加 `## 16. wechat_reports` 章节（字段/注释/建表语句），并更新表清单。

- [ ] **Step 6: Commit**

```bash
git add docs/database-schema.md
git commit -m "docs: 数据库表结构文档补充 wechat_reports 表"
```

---

## Self-Review

- **Spec 覆盖**：
  - 定时触发（日报22:00/周报周日8:00/月报最后一天8:00）→ Task 2 `isReportDue` + Task 4 调度循环 ✅
  - 命令触发 `/日报 /周报 /月报` → Task 5 ✅
  - 仅聊天记录 + 窗口查询 → Task 3 `queryChatRecords` ✅
  - 完整 agent loop 复用 `runAgentTurn` + `loadHistory:false` → Task 4 ✅
  - 消息 + 入库（不存笔记）→ Task 4 `sendAndPersist`/`saveReport` ✅
  - Web 页面独立查询 + 下钻 → Task 7 ✅
  - 控制器/路由 API → Task 6 ✅
  - 无防重发守卫 → Task 4 调度循环无守卫，UNIQUE 兜底 ✅
  - 迁移 023 → Task 1 ✅
  - 测试 → Task 2/3/4 用例 + Task 8 全量 ✅
- **Placeholder 扫描**：无 TBD/TODO；所有代码步骤含完整代码。
- **类型一致性**：`ReportType = 'daily'|'weekly'|'monthly'` 在 service/controller/frontend api 统一；`getReportWindow`/`isReportDue`/`saveReport`/`listReports`/`getReportById`/`generateReport`/`sendAndPersist`/`handleReportCommand` 签名在各任务一致。`handleReportCommand` 在 Task 4 与 Task 5 中统一为"返回 content、不发送"，由调用方 reply（Task 5 已注明需同步调整 Task 4 定义）。
- **已知调整**：Task 4 `sendAndPersist` 允许注入 `sendFn` 便于测试；`handleReportCommand` 不发送、返回 content。
