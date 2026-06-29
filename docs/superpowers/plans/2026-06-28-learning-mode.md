# 微信 Bot 学习模式功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为微信 Bot 添加 `/学习 <主题>` 命令切换学习模式，以问答方式辅助用户学习。

**Architecture:** 在 onMessage 处理中增加命令解析，匹配 `/学习` 和 `/退出` 命令，切换 systemPrompt。学习模式下使用专用 prompt 模板。

**Tech Stack:** TypeScript, WeChatBot SDK

---

## 文件结构

- Modify: `server/src/services/wechat/ilink-bot.service.ts` — 添加命令解析和模式切换
- Create: `server/src/database/migrations/013_learning_mode_config.sql` — 学习模式 prompt 配置

---

## Task 1: 添加学习模式状态和命令解析

**Files:** Modify: `server/src/services/wechat/ilink-bot.service.ts`

- [ ] **Step 1: 添加模式状态和 prompt 模板**

在 `const MAX_HISTORY_LENGTH = 100` 后面添加：

```typescript
// 用户模式状态
const userModes = new Map<string, { mode: 'normal' | 'learning'; learningTopic: string }>()

// 学习模式 systemPrompt 模板
function getLearningPrompt(topic: string): string {
  return `你是一个学习导师，正在帮助用户学习「${topic}」。
请按以下方式教学：
1. 先使用 search_knowledge_base 和 get_note 工具检索用户的笔记资料
2. 以问答方式测试用户对知识点的掌握
3. 根据用户的回答给予反馈和补充解释
4. 控制每次提问1-2个问题，不要连续轰炸
5. 用户答对时鼓励，答错时耐心纠正
6. 如果笔记中没有相关内容，诚实告知并给出通用知识`
}
```

- [ ] **Step 2: 在 onMessage 最前面添加命令解析**

在 `saveWeChatUser(msg.userId)` 之后、`if (!msg.text) return` 之前添加：

```typescript
      // 命令解析
      if (msg.text.startsWith('/学习 ')) {
        const topic = msg.text.slice(4).trim()
        if (!topic) {
          await bot!.reply(msg, '请指定学习主题，例如：/学习 Python')
          return
        }
        userModes.set(msg.userId, { mode: 'learning', learningTopic: topic })
        await bot!.reply(msg, `已进入学习模式，正在准备「${topic}」的学习内容...`)
        return
      }

      if (msg.text.trim() === '/退出') {
        userModes.delete(msg.userId)
        await bot!.reply(msg, '已退出学习模式，恢复普通聊天。')
        return
      }
```

- [ ] **Step 3: 修改 systemPrompt 传递逻辑**

将 `config.system_prompt` 替换为根据模式动态选择：

```typescript
      try {
        // 根据模式选择 systemPrompt
        const userMode = userModes.get(msg.userId)
        const effectivePrompt = userMode?.mode === 'learning'
          ? getLearningPrompt(userMode.learningTopic)
          : config.system_prompt

        const result = await streamChatWithPi(
          config.provider,
          config.model,
          [...history.slice(0, -1), { role: 'user', content: messageWithTime }],
          effectivePrompt,  // 使用动态 prompt
          ...
        )
```

- [ ] **Step 4: 提交**

```bash
git add server/src/services/wechat/ilink-bot.service.ts
git commit -m "feat: add learning mode with /study command"
```

---

## Task 2: 数据库迁移（可选，保留 prompt 模板配置）

**Files:** Create: `server/src/database/migrations/013_learning_mode_config.sql`

- [ ] **Step 1: 创建迁移文件**

```sql
-- v1.19 learning-mode-config
INSERT OR IGNORE INTO settings (key, value) VALUES ('ilink_learning_prompt', '"你是一个学习导师，正在帮助用户学习「{topic}」。请按以下方式教学：1. 先使用 search_knowledge_base 和 get_note 工具检索用户的笔记资料 2. 以问答方式测试用户对知识点的掌握 3. 根据用户的回答给予反馈和补充解释 4. 控制每次提问1-2个问题，不要连续轰炸 5. 用户答对时鼓励，答错时耐心纠正 6. 如果笔记中没有相关内容，诚实告知并给出通用知识"');
SELECT '013_learning_mode_config done' as status;
```

- [ ] **Step 2: 提交**

```bash
git add server/src/database/migrations/013_learning_mode_config.sql
git commit -m "feat: add learning mode config migration"
```

---

## Task 3: 测试验证

- [ ] **Step 1: 启动服务器**

Run: `cd server && npm run dev`
Expected: 服务器启动成功

- [ ] **Step 2: 启动 Bot**

```bash
TOKEN=$(curl -s -X POST "http://localhost:3000/api/auth/login" -H "Content-Type: application/json" -d '{"password":"admin123"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')
curl -s -X PUT "http://localhost:3000/api/ilink/config" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"enabled":true}' > /dev/null
curl -s -X POST "http://localhost:3000/api/ilink/start" -H "Authorization: Bearer $TOKEN"
```
Expected: Bot 启动成功

- [ ] **Step 3: 微信测试**

在微信上发送：
```
/学习 Python
```
Expected: Bot 回复"已进入学习模式，正在准备「Python」的学习内容..."

发送：
```
/退出
```
Expected: Bot 回复"已退出学习模式，恢复普通聊天。"

- [ ] **Step 4: 检查服务器日志**

Run: `grep "学习\|学习模式\|learning" /tmp/server.log | tail -5`
Expected: 日志显示模式切换正常

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: complete learning mode feature"
```
