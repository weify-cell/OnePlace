# 微信 Bot 记忆功能设计

> 日期：2026-08-02
> 状态：已评审通过，进入实现

## Goal

给微信 Bot 增加长期记忆：每晚对当天对话做一次记忆整理，结果写入数据库与向量库；与 Bot 对话时在 system prompt 附加上近 30 天的记忆；并提供数据库检索与向量检索两个 Agent 工具。

## 需求要点

1. **每晚记忆整理**：每天晚上根据当前对话内容做一次记忆整理（已定 00:30 北京时间，避开 22:00 日报）。
2. **双写**：整理出的记忆写入数据库 + 向量库（Qdrant）。
3. **对话附记**：与 Bot 对话时，system prompt 附加上近 30 天的记忆内容。
4. **两个检索工具**：数据库检索工具 + 向量库检索工具。
5. **记忆粒度**：离散记忆条目（每晚抽取多条独立事实/偏好/承诺/项目状态，逐条存储）。
6. **system prompt 附带量**：近 30 天**全部**条目（默认不限量，留配置兜底）。

## 架构决策

### 数据模型

**新表 `wechat_memories`**（迁移 `024_wechat_memories.sql`）：

```sql
CREATE TABLE IF NOT EXISTS wechat_memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  memory_date TEXT NOT NULL,        -- 北京日期 YYYY-MM-DD（该记忆整理自哪天）
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, content)          -- 内容级去重兜底（LLM 可能重复抽取）
);
CREATE INDEX idx_wechat_memories_user_date ON wechat_memories(user_id, memory_date, id);
```

- `content` 为单条记忆的文本（如「用户喝美式不加糖」）。
- 去重策略：`UNIQUE(user_id, content)` + `INSERT OR IGNORE` 兜底；LLM 抽取指令也参考已有记忆避免重复抽取。
- `memory_date` 用于「近 30 天」过滤（避免依赖 created_at 换算时区）。

**向量库**：独立 collection **`oneplace_memory`**，新配置 `qdrant_memory_collection`（默认 `oneplace_memory`），与笔记 collection 分开，避免污染知识库检索。

- 向量维度 1024、Cosine（复用现有约定）。
- embedding 复用现有 `embedText`（同 provider/model 配置）。
- 点 payload：`{ memory_id, user_id, memory_date, content }`。
- 点 id：`mem${memoryId}`（字符串，与笔记的纯数字 id 区分）。

### 每晚 00:30 整理（镜像 report.service 调度）

新建 `server/src/services/wechat/memory.service.ts`：

- `isMemoryDue(now)`：北京时区 00:30，分钟 ≤1 容忍（与报告一致），周六日也整理（每天都可能有新对话）。
- `checkAndConsolidateMemories()`：遍历 `getWeChatUsers()`（复用 report 的读取方式），逐用户整理。
- `startMemoryService()` / `stopMemoryService()`：`setInterval` 60s 心跳 + 初始 30s 延迟；bot 登录成功 2s 后启动，stop 时清理（与 report/reminder 服务一致）。
- 内存级 in-flight 锁：`inflightMemories` Set，防止重启双发/并发污染。

**单用户整理流程** `consolidateDayMemory(userId)`：

1. 窗口 = 当天北京 00:00 → now（复用 report 的 `getReportWindow('daily', now)`）。
2. `queryChatRecords(userId, window)` 取当天对话。
3. 无记录则跳过（不调用 LLM）。
4. `runAgentTurn`（agentId `memory:consolidate:${userId}`，`loadHistory:false`、`removeAfterRun:true`，动态 import 避免循环依赖）：
   - systemPrompt = `DEFAULT_MEMORY_SYSTEM_PROMPT`（新加到 `prompt-defaults.ts`）：抽取事实/偏好/承诺/项目状态等值得长期记住的信息；每行一条 `- ` 前缀；参考已有记忆避免重复；禁止编造；如无值得记住的内容返回空。
   - userContent = 当天转录 + 最近已有记忆（近 30 天条目文本）作防重上下文。
5. 解析输出：兼容 `- `/`* `/数字/普通行，过滤空行与过短（<2 字）行。
6. 逐条 `saveMemory` → 对**新增**条目 embedding → upsert 到 `oneplace_memory`。
7. **静默执行**：不向微信发消息；向量写入失败不阻断 DB 落库（记日志）。

**复用注意**：`report.service.ts` 的 `queryChatRecords` 已导出；`buildTranscript`、`getWeChatUsers` 目前为模块内私有函数，需在本次改动中加 `export` 供 memory.service 复用（DRY，避免重复实现）。

### 对话附带近 30 天记忆

`ilink-bot.service.ts` 的 `onMessage` 组装 `effectivePrompt` 时，在 skillPrompt 之后追加 `buildMemoryPrompt(userId)`：

- 查近 30 天（`memory_date` ≥ 今天北京日期 - 29）**全部**条目，按 `memory_date, id` 排序。
- 格式化：`## 记忆（近30天）\n- MM-DD: 内容`。
- 无记忆则返回空串，不追加。
- 默认不限量；留配置 `ilink_memory_prompt_max_items`（0=不限，默认 0）兜底极端情况。
- 追加顺序：`basePrompt`（system_prompt + note_tools_prompt 或学习 prompt）→ skillPrompt → 记忆段。学习模式同样附带记忆。

### 两个检索工具

在 `builtin-tools.ts` 增加两个内置工具，并经迁移种子到 `tools` 表（管理页可启停，`loadToolsFromDb()` 自动生效）：

1. **`search_memory`**（数据库检索）
   - 参数：`query: string`（必填）、`limit?: number`（默认 10）、`user_id?: string`
   - 逻辑：`instr(content, ?) > 0` 关键词匹配，按 `memory_date DESC, id DESC` 倒序，返回每条 `[MM-DD] content`
   - 空结果返回「未找到相关记忆」

2. **`search_memory_vectors`**（向量检索）
   - 参数：`query: string`（必填）、`limit?: number`（默认 5）、`user_id?: string`
   - 逻辑：embed query → 搜 `oneplace_memory` collection（按 user_id 过滤）→ topK 带相关度 `[MM-DD] content (相关度 xx%)`

**user_id 处理**：可选。Bot 的 system prompt 记忆段声明「当前用户微信ID：{userId}」，指引 agent 调用时传入；Web 对话不传则不过滤 user_id（单用户本地部署，记忆同属一人）。

### 配置 & 接线

- 新配置（`settings` 表，随迁移播种默认值 + description，复用 003/010 的 `INSERT OR IGNORE` 惯例）：
  - `qdrant_memory_collection` = `oneplace_memory`
  - `ilink_memory_prompt_max_items` = `0`
  - 迁移：`026_seed_memory_settings.sql`：`INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)`
- `ilink-bot.service.ts`：
  - 登录成功 setTimeout 里加 `setMemoryBot?` 不需要（静默，无 bot 依赖）→ 直接 `startMemoryService()`
  - `stopILinkBot()` 里加 `stopMemoryService()`
- `builtin-tools.ts` + 迁移 `025_seed_memory_tools.sql` 注册两个工具（enabled=1）。

### 测试

`server/src/__tests__/memory.service.test.ts`（镜像 `report.service.test.ts` 的 mock 手法：async `vi.mock` DB factory + `vi.doMock` ilink-bot）：

- `isMemoryDue`：00:30 到点、00:31 容忍、00:32 不触发、其他时刻不触发。
- `saveMemory`：落表、同 (user, content) 去重幂等。
- `queryMemories`：近 30 天过滤正确。
- 解析函数：`- `/`* `/数字前缀/普通行/空行/过短行的处理。
- `consolidateDayMemory`：当天有记录→生成并落库、去重；当天无记录→跳过不调 LLM。
- 去重计数：`saveMemory` 返回是否新增，用于决定是否 embedding。

## 不做（YAGNI）

- 记忆管理前端页。
- 手动 `/记忆整理` 命令。
- 记忆条目的编辑/删除。
- 跨用户记忆共享。

## 相关文件清单

- 创建：`server/src/database/migrations/024_wechat_memories.sql`
- 创建：`server/src/database/migrations/025_seed_memory_tools.sql`
- 创建：`server/src/database/migrations/026_seed_memory_settings.sql`
- 创建：`server/src/services/wechat/memory.service.ts`
- 创建：`server/src/__tests__/memory.service.test.ts`
- 修改：`server/src/services/prompt-defaults.ts`（`DEFAULT_MEMORY_SYSTEM_PROMPT`）
- 修改：`server/src/services/ai/builtin-tools.ts`（`search_memory` / `search_memory_vectors`）
- 修改：`server/src/services/wechat/ilink-bot.service.ts`（onMessage 附记 + 启动/停止 memory service）
- 修改：`server/src/services/vector/vector.service.ts`（collection 参数 + filter 支持）
- 修改：`docs/database-schema.md`（新增 `wechat_memories` 表）
