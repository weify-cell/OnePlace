# Agent 框架升级设计

> 版本：v2.0 | 日期：2026-07-10 | 状态：待实施

## 背景

当前 bot 和聊天页的 agent loop 是手写的（`pi-ai.adapter.ts` 的 `streamChatWithPi`），工具注册和执行在 `tools.registry.ts` 中自行管理。引入 `@earendil-works/pi-agent-core` 0.80.6 后，可以用框架内置的 `Agent` 类替代自建循环，获得事件驱动、中断控制、并行工具执行等能力。

## 非目标

- 不引入 pi-agent-core 的 session/harness/compaction 模块
- 不改变前端 UI
- 不改变 DB schema
- 不改变 LLM 提供商配置方式

## 架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 升级范围 | 微信 bot + 聊天页一起 | 一步到位，避免两套代码并存 |
| 工具迁移 | 直接改为 AgentTool，废弃 tools.registry.ts 运行时 | Agent 内置工具执行，无需自建注册表 |
| 事件处理 | bot 和聊天页各自订阅 Agent 事件 | 场景差异大，强行统一中间层会增加耦合 |
| Prompt 管理 | 调用方组装，和消息一起传入 | 灵活适配 kb_enabled 切换场景 |
| Agent 生命周期 | 长生命周期，启动时从 DB 恢复 | 减少每次请求的 DB 开销，适合高频对话 |

## 整体架构

```
                      ┌─────────────────────────────┐
                      │         AgentPool            │
                      │  Map<userId, Agent>  (bot)   │
                      │  Map<convId, Agent>  (chat)  │
                      └──────────┬──────────────────┘
                                 │ subscribe(events)
              ┌──────────────────┼──────────────────┐
              ▼                                     ▼
        ilink-bot.service                  chat.service
         bot.reply(content)                SSE write(delta / done)
              │                                     │
              ▼                                     ▼
          wechat_messages 表                  messages 表
```

## AgentPool 设计

```typescript
class AgentPool {
  private agents: Map<string, Agent>
  private streamFn: StreamFn      // 共享，封装 apiKey/baseUrl
  private tools: AgentTool[]      // 共享，从 builtin-tools.ts 加载

  getOrCreate(id: string, historyFn: () => Message[]): Agent
  remove(id: string): void
}
```

**重启恢复：** 构造函数中遍历 `wechat_messages`（去重 user_id）和 `conversations`（未删除）表，为每个用户/会话创建 Agent 并灌入历史。

**闲置清理：** 不做。个人用户场景无必要，重启即清理。

## 事件流与消息持久化

### Bot 端

```
AgentEvent        →  处理
─────────────────────────────────────
text_delta        →  忽略（微信不支持流式）
thinking_delta    →  忽略
tool_call         →  忽略
agent_end         →  提取 assistant 文本
                    → bot.reply(msg, content)
                    → 写入 wechat_messages 表（user + assistant 各 1 条）
```

### 聊天页端

```
AgentEvent        →  处理
─────────────────────────────────────
text_delta        →  SSE: event=delta, data={content}
thinking_delta    →  SSE: event=thinking_delta, data={content}
tool_call         →  SSE: event=tool_call, data={name, status}
agent_end         →  SSE: event=done, data={content, tokensUsed}
                    → 写入 messages 表
```

**与旧方案的区别：** 不再「先插空 assistant 行 → 流式更新」，agent_end 拿到完整消息后一次性写入。

## 工具迁移

### 格式变化

```typescript
// 旧
registerTool({ name, description, parameters }, async (args) => { ... })

// 新
{
  name, description, parameters,
  execute: async (args, ctx) => {
    // ctx.signal: AbortSignal
    // ctx.update: (partial) => void
    return { content: [{ type: 'text', text: '...' }], isError: false }
  }
}
```

### tools.registry.ts 去留

| 函数 | 处理 |
|------|------|
| `registerTool()` | 删除 |
| `executeToolCall()` | 删除 |
| `getToolDefinitions()` | 删除 |
| `toolCallToRecord()` | 保留（bot 日志用） |
| `toolResultToRecord()` | 保留（bot 日志用） |

## 变更文件清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `pi-ai.adapter.ts` | 重写 | streamChatWithPi → Agent 封装 |
| `builtin-tools.ts` | 重写 | AgentTool 格式，注入 execute |
| `tools.registry.ts` | 缩减 | 只保留序列化函数 |
| `ilink-bot.service.ts` | 修改 | 用 AgentPool + subscribe 替换 streamChatWithPi 调用 |
| `chat.service.ts` | 修改 | 同上 |
| `prompt-defaults.ts` | 不变 | - |

## 向后兼容

- DB schema 不变（wechat_messages、messages 表结构无变化）
- 前端 API 契约不变（SSE 事件格式保持一致）
- bot 回复格式不变（微信文本回复）
