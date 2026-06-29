# 微信 Bot 学习模式功能设计

## 概述

为微信 Bot 添加学习模式，用户通过命令切换模式，Bot 以问答方式辅助学习。

## 功能需求

### 核心功能

1. **命令切换**：`/学习 <主题>` 进入学习模式，`/退出` 恢复普通模式
2. **学习导师角色**：切换专用 systemPrompt，以问答方式教学
3. **笔记检索**：AI 自动检索知识库和笔记，获取相关知识点
4. **问答教学**：以提问-回答-反馈的方式进行教学

### 交互流程

```
用户: /学习 机器学习
Bot:  已进入学习模式，正在准备「机器学习」的学习内容...
      (检索笔记)
Bot:  我们来开始学习「机器学习」。第一个问题：
      监督学习和无监督学习的主要区别是什么？

用户: 监督学习需要标注数据，无监督不需要
Bot:  ✅ 回答正确！
      补充一点：半监督学习介于两者之间...
      继续下一个问题...

用户: /退出
Bot:  已退出学习模式，恢复普通聊天。
```

### systemPrompt 设计

```
你是一个学习导师，正在帮助用户学习「{主题}」。
请按以下方式教学：
1. 先使用 search_knowledge_base 和 get_note 工具检索用户的笔记资料
2. 以问答方式测试用户对知识点的掌握
3. 根据用户的回答给予反馈和补充解释
4. 控制每次提问1-2个问题，不要连续轰炸
5. 用户答对时鼓励，答错时耐心纠正
6. 如果笔记中没有相关内容，诚实告知并给出通用知识
```

## 技术设计

### 修改文件

- `server/src/services/wechat/ilink-bot.service.ts` - 添加命令解析和模式切换
- `server/src/controllers/ilink.controller.ts` - 添加学习模式配置
- `server/src/database/migrations/013_learning_mode_config.sql` - 配置迁移

### 数据结构

```typescript
// 用户模式状态
const userModes = new Map<string, {
  mode: 'normal' | 'learning'
  learningTopic: string
}>()

// 学习模式 systemPrompt 模板
const LEARNING_PROMPT = `你是一个学习导师，正在帮助用户学习「{topic}」。
请按以下方式教学：
1. 先使用 search_knowledge_base 和 get_note 工具检索用户的笔记资料
2. 以问答方式测试用户对知识点的掌握
3. 根据用户的回答给予反馈和补充解释
4. 控制每次提问1-2个问题，不要连续轰炸
5. 用户答对时鼓励，答错时耐心纠正
6. 如果笔记中没有相关内容，诚实告知并给出通用知识`
```

### 命令解析

```typescript
// /学习 主题名称
if (msg.text.startsWith('/学习 ')) {
  const topic = msg.text.slice(4).trim()
  userModes.set(msg.userId, { mode: 'learning', learningTopic: topic })
  await bot.reply(msg, `已进入学习模式，正在准备「${topic}」的学习内容...`)
  return
}

// /退出
if (msg.text.trim() === '/退出') {
  userModes.delete(msg.userId)
  await bot.reply(msg, '已退出学习模式，恢复普通聊天。')
  return
}
```

### 模式切换后传给 AI 的上下文

```typescript
// 普通模式
systemPrompt = config.system_prompt
toolsEnabled = true

// 学习模式
systemPrompt = LEARNING_PROMPT.replace('{topic}', userMode.learningTopic)
toolsEnabled = true  // AI 需要工具检索笔记
```

## API 设计

### 获取学习模式配置

```typescript
GET /api/ilink/learning-mode/config
Response: {
  prompt_template: string
}
```

### 更新学习模式配置

```typescript
PUT /api/ilink/learning-mode/config
Request: {
  prompt_template?: string
}
```

## 测试用例

### 功能测试

1. **进入学习模式**
   - 用户: `/学习 Python`
   - 预期: Bot 回复已进入学习模式

2. **学习问答**
   - 用户: 回答问题
   - 预期: Bot 给予反馈并继续提问

3. **退出学习模式**
   - 用户: `/退出`
   - 预期: Bot 回复已退出学习模式

### 边界测试

1. **空主题**: `/学习`（无主题）
2. **重复进入**: 学习模式下再次发送 `/学习`
3. **无效命令**: `/学习模式`（多余字符）
