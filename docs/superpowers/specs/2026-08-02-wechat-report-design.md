# 微信日报/周报/月报 — 设计文档

> 日期：2026-08-02
> 状态：已批准，待实现
> 关联：`server/src/services/wechat/`、`wechat_messages` 表、`runAgentTurn`

## 背景与目标

微信 Bot 目前基于 `wechat_messages` 表维护聊天历史（每用户最近 100 条）。目标：新增**日报/周报/月报**功能，按定时任务**总结聊天记录**，通过微信消息交付，并**入库 + Web 页面查询**，支持 月报→周报→日报 下钻与各类型独立查询。

需求来源：用户明确选择方案 A（自研调度，不引依赖）+ 方案 C（命令触发），并否决了"存笔记"与"防重发守卫"。

## 核心决策

| 项 | 决策 |
|---|---|
| 触发 | 定时自动（日报 22:00 / 周报周日 8:00 / 月报每月最后一天 8:00）+ 命令（`/日报` `/周报` `/月报`） |
| 内容 | 仅聊天记录（`wechat_messages`，按北京时区时间窗口） |
| 生成 | 复用 `runAgentTurn` 完整 agent loop，`loadHistory:false`，独立 agentId，不污染用户上下文 |
| 交付 | 微信消息 + 写入 `wechat_reports` 表（**不存笔记**） |
| 查询 | 新建 Web 页面，独立查询 + 下钻 |
| 守卫 | **无防重发守卫**（不追踪"已发"状态） |
| 调度 | 1 分钟 `setInterval` 心跳 + 北京时间判定，不引 cron 依赖 |

## 数据库

### 新表 `wechat_reports`（迁移 `023_wechat_reports.sql`）

| 字段 | 类型 | 约束 | 注释 |
|---|---|---|---|
| id | INTEGER | PK AUTOINCREMENT | 主键 |
| user_id | TEXT | NOT NULL | 微信用户 ID |
| report_type | TEXT | NOT NULL CHECK IN ('daily','weekly','monthly') | 报告类型 |
| period_start | TEXT | NOT NULL | 覆盖周期开始（UTC ISO8601） |
| period_end | TEXT | NOT NULL | 覆盖周期结束（UTC ISO8601） |
| content | TEXT | NOT NULL | 报告 markdown 全文 |
| created_at | TEXT | NOT NULL DEFAULT (now) | 生成时间 |

```sql
CREATE TABLE IF NOT EXISTS wechat_reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT    NOT NULL,
  report_type  TEXT    NOT NULL CHECK(report_type IN ('daily','weekly','monthly')),
  period_start TEXT    NOT NULL,
  period_end   TEXT    NOT NULL,
  content      TEXT    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_wechat_reports_user_type
ON wechat_reports(user_id, report_type, period_start);
```

**UNIQUE 兜底**（数据完整性，非"已发守卫"）：`UNIQUE(user_id, report_type, period_start)` + 写入用 `INSERT OR IGNORE`，防止极端情况下同周期重复行。

### 周期窗口（北京时间）

| 类型 | 触发时刻 | period_start | period_end |
|---|---|---|---|
| daily | 每天 22:00 | 当天 00:00 | 触发时刻 |
| weekly | 周日 8:00 | 本周一 00:00 | 触发时刻 |
| monthly | 每月最后一天 8:00 | 本月 1 日 00:00 | 触发时刻 |

> `wechat_messages.created_at` 为 UTC ISO8601，查询时需把北京窗口起点转 UTC 再比较。
> 已知限制：`wechat_messages` 每用户仅保留最近 100 条，周报/月报可能被截断；生成时把实际条数写入 prompt 如实说明。

## 服务层

### 新文件 `server/src/services/wechat/report.service.ts`

复用 `proactive-chat.service.ts` 的服务模式（bot 注入 + start/stop）。与 ilink-bot 存在循环依赖，运行时用动态 `import('./ilink-bot.service.js')` 取 `runAgentTurn` / `formatBeijingTime`（与 proactive 一致）。

职责：

- **`startReportService()`**：启动 1 分钟 `setInterval` 心跳 `checkAndSendReports()`；`stopReportService()` 清理。
- **`checkAndSendReports()`**：遍历 `getWeChatUsers()`（`ilink_user_%`），对每个用户按到点判定生成对应报告。无守卫，到点即生成。
- **`getReportWindow(type)`**：计算北京时区窗口（起/止），转 UTC。
- **`generateReport(userId, type, window)`**：
  - 查 `wechat_messages`：`SELECT role, content FROM wechat_messages WHERE user_id=? AND created_at>=? AND created_at<? ORDER BY id ASC`
  - 组 prompt：`systemPrompt` = `DEFAULT_REPORT_SYSTEM_PROMPT`（`{type}` 占位，仅报告专属，不拼 note_tools_prompt/skills）；`userContent` = 北京时戳 + 转录文本 + 条数 + 覆盖时段
  - `runAgentTurn({ userId, agentId: 'report:'+type+':'+userId, systemPrompt, userContent, removeAfterRun: true, loadHistory: false })`
- **`saveReport(userId, type, window, content)`**：`INSERT OR IGNORE INTO wechat_reports ...`
- **`sendAndPersist(userId, type)`**：`generateReport` → 成功则 `bot.send` + `saveReport`；失败则发送兜底文案，不落表，记日志。
- **`handleReportCommand(msg, type)`**：命令入口，先回"正在生成报告..."，生成后 `bot.reply` + `saveReport`。即时执行，不受调度窗口限制。
- **查询**：`listReports({ type, start, end, userId })`、`getReportById(id)`。

### 修改 `server/src/services/wechat/ilink-bot.service.ts`

- `runAgentTurn` 增加可选参数 `loadHistory?: boolean`（默认 true）：为 `false` 时 `getOrCreate` 的初始 history 为 `[]`，避免重复灌入用户历史。
- `onMessage` 新增命令解析（放在现有 `/学习` 等命令之后）：
  - `/日报` → `handleReportCommand(msg, 'daily')`
  - `/周报` → `handleReportCommand(msg, 'weekly')`
  - `/月报` → `handleReportCommand(msg, 'monthly')`
- 登录成功后接线：`setReportBot(bot!)` + `startReportService()`（与 proactive/reminder 并列）。

### 修改 `server/src/services/prompt-defaults.ts`

新增 `DEFAULT_REPORT_SYSTEM_PROMPT`：包含 `{type}` 占位，说明报告类型、格式（分条/要点式、1-2 段以内、只基于转录文本、不调用工具）。

### 控制器/路由

- `ilink.controller.ts`：`getReports`（列表，支持 type/start/end/userId 过滤）、`getReport`（详情）。
- `ilink.routes.ts`：`GET /reports`、`GET /reports/:id`。

## 前端

### 新文件 `src/views/ReportsView.vue` + 路由 `/reports` + 侧边栏"报告"入口（📊）

- **布局**：顶部 Tab（日报/周报/月报）实现独立查询；左侧报告列表（周期 + 标题），右侧内容展示（markdown 渲染）。
- **下钻**：月报内容区"查看本月周报" → 切周报 Tab 并按该月范围过滤；周报内容区"查看本周日报" → 切日报 Tab 按该周范围过滤；面包屑逐级返回。
- **API 调用**：`GET /api/ilink/reports?type=&start=&end=`、`GET /api/ilink/reports/:id`。

## 错误处理与边界

- 生成失败：发送"报告生成失败"兜底文案 + `console.error`，不落表（下次调度/命令重试）。
- `bot` 未初始化：跳过调度，记日志。
- 窗口内无聊天消息：仍生成报告，prompt 告知"该周期无聊天记录"，落一条空内容报告。
- 命令触发并发：即时响应，不排队；内容进表后网页可见。
- 重启落在触发分钟内：可能偶发重复生成，由 UNIQUE + `INSERT OR IGNORE` 兜底（无状态守卫）。

## 测试（`server/src/__tests__/report.service.test.ts`）

mock 掉 LLM 调用（`runAgentTurn`），覆盖：

1. 周期窗口计算：日报/周报/月报的北京→UTC 起止边界（含跨月最后一天）
2. 调度到点判定：给定假时间，各类型是否应触发
3. 聊天记录查询：按窗口过滤 + 条数统计
4. 落表：`INSERT OR IGNORE` 幂等（同周期重复插入不产生新行）
5. 查询 API：列表过滤与下钻范围过滤

## 不做（YAGNI）

- 不存笔记、不加防重发守卫、不引 cron 依赖
- 不加设置页 UI（`ilink_report_enabled` 总开关暂不引入，服务随 bot 启动）
- 不提高 `wechat_messages` 100 条上限（作为已知限制接受）
