import { WeChatBot } from '@wechatbot/wechatbot'
import { convertMessages, type ChatMessage } from '../ai/pi-ai.adapter.js'
import { runAgentTurn, removeAgent, shutdownAgents } from '../ai/agent-turn.js'
import { buildSystemPrompt } from '../ai/prompt.js'
import { getSettingValue, setSetting } from '../settings.service.js'
import { connectDatabase } from '../../database/index.js'
import { sendPendingReminders, hasPendingReminders } from './todo-reminder.service.js'
import { startAllSubsystems, stopAllSubsystems } from './subsystems.js'
import { saveWeChatUser } from './users.service.js'
import { handleReportCommand } from './report.service.js'
import { buildMemoryPrompt } from './memory.service.js'
import { getILinkModel } from './model.js'
import { AgentEvent, type AgentMessage } from '@earendil-works/pi-agent-core'
import { formatBeijingTime } from '../../utils/time.js'

// 北京时间格式化统一由 utils/time.js 实现，此处 re-export 以保持既有引用可用
export { formatBeijingTime }

// Bot 实例
let bot: WeChatBot | null = null
let botRunning = false
let botStartTime: number | null = null
let messagesProcessed = 0
let lastMessageAt: string | null = null
let lastError: string | null = null

// 登录状态
let loginQRCode: string | null = null
let loginStatus: 'idle' | 'waiting' | 'scanned' | 'confirmed' | 'expired' = 'idle'

// 消息历史持久化到数据库
const MAX_HISTORY_LENGTH = 100

// 用户模式状态
const userModes = new Map<string, { mode: 'normal' | 'learning'; learningTopic: string }>()

// ── agent event 监控 ──────────────────────────────────────────

/** 提取消息的紧凑预览文本 */
function briefMsg(msg: AgentMessage): string {
  if (msg.role === 'user') {
    const text = typeof msg.content === 'string'
      ? msg.content
      : (Array.isArray(msg.content) ? msg.content.filter((c): c is { type: 'text'; text: string } => c.type === 'text').map(c => c.text).join('') : '');
    const preview = text.length > 60 ? text.slice(0, 60) + '…' : text;
    return `user: "${preview}" (${text.length}c)`;
  }
  if (msg.role === 'assistant') {
    const parts: string[] = [];
    if (Array.isArray(msg.content)) {
      for (const c of msg.content) {
        if (c.type === 'text') {
          const preview = c.text.length > 50 ? c.text.slice(0, 50) + '…' : c.text;
          parts.push(`text:"${preview}" (${c.text.length}c)`);
        }
        else if (c.type === 'toolCall') parts.push(`call→${c.name}`);
      }
    }
    return `assistant: [${parts.join(', ') || 'empty'}]`;
  }
  if (msg.role === 'toolResult') {
    const text = Array.isArray(msg.content)
      ? msg.content.filter((c): c is { type: 'text'; text: string } => c.type === 'text').map(c => c.text).join('')
      : '';
    return `toolResult: ${msg.toolName}#${msg.toolCallId?.slice(-8)} (${text.length}c)`;
  }
  const fallback = msg as unknown as { role: string; content?: unknown };
  const text = typeof fallback.content === 'string' ? fallback.content : '';
  if (text) {
    const preview = text.length > 80 ? text.slice(0, 80) + '…' : text;
    return `${fallback.role}: "${preview}" (${text.length}c)`;
  }
  return `${fallback.role}`;
}

/** 从消息数组中提取最后一个 assistant 消息的文本内容 */
/**
 * 取某个用户的历史消息（转成 pi-ai 消息形状），仅在 agent 首次创建时调用。
 */
function historyLoader(userId: string): ChatMessage[] {
  return getMessageHistory(userId) as ChatMessage[]
}

function readAgentStart() {
  console.log('[Agent] ▶ agent_start');
}

function readAgentEnd(event: AgentEvent) {
  if (event.type !== 'agent_end') return;
  const count = event.messages.length;
  console.log(`[Agent] ◀ agent_end    ${count}msgs total`);
}

function readTurnStart() {
  console.log('[Agent]   ▶ turn_start');
}

function readTrunEnd(event: AgentEvent) {
  if (event.type !== 'turn_end') return;
  const toolCount = event.toolResults.length;
  console.log(`[Agent]   ◀ turn_end     ${briefMsg(event.message)}  tools:${toolCount}`);
}

function readMessageStart(event: AgentEvent) {
  if (event.type !== 'message_start') return;
  console.log(`[Agent]     ▶ msg_start   ${briefMsg(event.message)}`);
}

function readMessageEnd(event: AgentEvent) {
  if (event.type !== 'message_end') return;
  console.log(`[Agent]     ◀ msg_end     ${briefMsg(event.message)}`);
}

function readToolExecutionStart(event: AgentEvent) {
  if (event.type !== 'tool_execution_start') return;
  const argsStr = JSON.stringify(event.args);
  const argsPreview = argsStr.length > 100 ? argsStr.slice(0, 100) + '…' : argsStr;
  console.log(`[Agent]       ▶ tool_start  ${event.toolName}#${event.toolCallId.slice(-8)}  ${argsPreview}`);
}

function readToolExecutionEnd(event: AgentEvent) {
  if (event.type !== 'tool_execution_end') return;
  let resultStr = JSON.stringify(event.result);
  const size = resultStr.length;
  if (resultStr.length > 200) resultStr = resultStr.slice(0, 100) + ' … ' + resultStr.slice(-100);
  console.log(`[Agent]       ◀ tool_end    ${event.toolName}#${event.toolCallId.slice(-8)}  (${size}c)${event.isError ? ' ⚠️' : ''}  ${resultStr}`);
}

// ───────────────────────────────────────────────────────────────

/**
 * 检查用户是否在学习模式
 */
export function isUserInLearningMode(userId: string): boolean {
  const userMode = userModes.get(userId)
  return userMode?.mode === 'learning'
}

/**
 * 获取用户学习模式信息
 */
export function getUserLearningMode(userId: string): { mode: 'normal' | 'learning'; learningTopic: string } | null {
  return userModes.get(userId) || null
}

/**
 * 获取 Bot 配置
 */
export function getILinkConfig() {
  return {
    enabled: getSettingValue<boolean>('ilink_enabled', false),
    provider: getSettingValue<string>('ilink_provider', 'qwen'),
    model: getSettingValue<string>('ilink_model', 'qwen-turbo'),
    system_prompt: getSettingValue<string>('ilink_system_prompt', '你是一个智能助手，可以通过微信为用户提供服务。请用中文回复。'),
    max_tool_rounds: getSettingValue<number>('ilink_max_tool_rounds', 5)
  }
}

/**
 * 获取 Bot 状态
 */
export function getILinkBotStatus() {
  return {
    running: botRunning,
    uptime: botStartTime ? Date.now() - botStartTime : null,
    messages_processed: messagesProcessed,
    last_message_at: lastMessageAt,
    error: lastError,
    login: {
      status: loginStatus,
      qrcode: loginQRCode
    }
  }
}

/**
 * 获取登录状态
 */
export function getLoginStatus() {
  return {
    status: loginStatus,
    qrcode: loginQRCode
  }
}

/**
 * 启动 Bot（异步启动，不等待登录完成）
 */
export async function startILinkBot(): Promise<{ success: boolean; error?: string }> {
  if (botRunning) {
    return { success: false, error: 'Bot is already running' }
  }

  const config = getILinkConfig()
  if (!config.enabled) {
    return { success: false, error: 'Bot is not enabled' }
  }

  try {
    // 创建 Bot 实例
    bot = new WeChatBot({
      storage: 'file',
      logLevel: 'info'
    })

    // 监听事件
    bot.on('login', (creds: any) => {
      console.log('[ilink] ================================')
      console.log('[ilink] 登录成功!', creds.accountId)
      console.log('[ilink] ================================')
      loginStatus = 'confirmed'
      loginQRCode = null
      botRunning = true
      botStartTime = Date.now()
      lastError = null
    })

    bot.on('session:expired', () => {
      console.log('[ilink] 会话已过期')
      lastError = 'Session expired'
      botRunning = false
    })

    bot.on('error', (err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error('[ilink] Bot 错误:', err)
      lastError = error.message
    })

    // 消息处理
    bot.onMessage(async (msg: any) => {
      console.log(`[ilink] 收到消息 ${msg.userId}: ${msg.text?.slice(0, 50)}`)

      // 保存用户 ID（用于提醒服务）
      saveWeChatUser(msg.userId)

      // 命令解析：/学习 主题
      if (msg.text?.startsWith('/学习 ')) {
        const topic = msg.text.slice(4).trim()
        if (!topic) {
          await bot!.reply(msg, '请指定学习主题，例如：/学习 Python')
          return
        }
        userModes.set(msg.userId, { mode: 'learning', learningTopic: topic })
        await bot!.reply(msg, `已进入学习模式，正在准备「${topic}」的学习内容...`)
        return
      }

      // 命令解析：/退出
      if (msg.text?.trim() === '/退出') {
        userModes.delete(msg.userId)
        await bot!.reply(msg, '已退出学习模式，恢复普通聊天。')
        return
      }

      // 命令解析：/清空上下文
      if (msg.text?.trim() === '/清空上下文') {
        clearMessageHistory(msg.userId)
        userModes.delete(msg.userId)
        removeAgent(msg.userId)
        await bot!.reply(msg, '已清空当前对话上下文。')
        return
      }

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

      // 检查是否有待发送的提醒（context_token 过期后积压的）
      if (hasPendingReminders(msg.userId)) {
        console.log(`[ilink] 发现待发送提醒，正在补发给 ${msg.userId}`)
        await sendPendingReminders(msg.userId)
      }

      // 只处理文本消息
      if (!msg.text) {
        console.log(`[ilink] 跳过非文本消息`)
        return
      }

      // 发送"正在输入"状态
      await bot!.sendTyping(msg.userId)

      try {
        const userMode = userModes.get(msg.userId)
        // 提示词拼装交回 ai/prompt.ts：普通对话 / 学习模式各自的组合规则只在那里定义
        const systemPrompt = await buildSystemPrompt({
          kind: userMode?.mode === 'learning' ? 'learning' : 'bot-chat',
          topic: userMode?.learningTopic,
          memoryPrompt: buildMemoryPrompt(msg.userId)
        })

        const timestamp = formatBeijingTime()
        const userText = `${timestamp} ${msg.text}`

        // 事件只用于日志监控；最终回复由回合接缝返回（唯一定义）
        const onEvent = (event: AgentEvent): void => {
          switch (event.type) {
            case 'tool_execution_start': readToolExecutionStart(event); break
            case 'tool_execution_end': readToolExecutionEnd(event); break
            case 'message_start': readMessageStart(event); break
            case 'message_end': readMessageEnd(event); break
            case 'agent_start': readAgentStart(); break
            case 'agent_end': readAgentEnd(event); break
            case 'turn_start': readTurnStart(); break
            case 'turn_end': readTrunEnd(event); break
          }
        }

        const replyContent = await runAgentTurn({
          agentId: msg.userId,
          systemPrompt,
          userContent: userText,
          history: () => historyLoader(msg.userId),
          onEvent,
          ...getILinkModel()
        })

        await bot!.reply(msg, replyContent || '抱歉，没有生成回复。')
        addMessageToHistory(msg.userId, 'user', userText)
        addMessageToHistory(msg.userId, 'assistant', replyContent)
        messagesProcessed++
        lastMessageAt = new Date().toISOString()
        lastError = null
      } catch (error) {
        const errMsg = (error as Error).message || 'Unknown error'
        console.error(`[ilink] 处理消息失败:`, errMsg)
        lastError = errMsg
        try {
          await bot!.reply(msg, '抱歉，处理您的消息时出现了错误，请稍后再试。')
        } catch (replyErr) {
          console.error('[ilink] 发送错误回复失败:', replyErr)
        }
      }
    })

    // 异步启动（不等待登录完成）
    console.log('[ilink] 正在启动 Bot...')
    loginStatus = 'waiting'

      // 异步执行登录和启动
      ; (async () => {
        try {
          // 登录（会显示二维码）
          console.log('[ilink] 正在获取二维码...')
          await bot!.login({
            callbacks: {
              onQrUrl: (url: string) => {
                console.log('[ilink] ================================')
                console.log('[ilink] 请扫描二维码登录:')
                console.log('[ilink]', url)
                console.log('[ilink] ================================')
                loginQRCode = url
                loginStatus = 'waiting'
              },
              onScanned: () => {
                console.log('[ilink] 已扫码，请在手机上确认登录')
                loginStatus = 'scanned'
              },
              onExpired: () => {
                console.log('[ilink] 二维码已过期')
                loginStatus = 'expired'
                loginQRCode = null
              }
            }
          })

          // 登录成功后启动消息循环
          console.log('[ilink] 登录成功，正在启动消息循环...')

          // 延迟启动提醒服务和主动聊天服务（等待 contextStore 加载完成）
          setTimeout(() => {
            // 子系统启停统一由调度层负责：bot 不再需要按名字认识每一个
            startAllSubsystems(bot!)
            console.log('[ilink] 微信后台子系统已启动')
          }, 2000) // 延迟 2 秒，确保 contextStore 加载完成

          await bot!.start()
          console.log('[ilink] Bot 已启动并运行')
        } catch (err) {
          console.error('[ilink] Bot 启动失败:', err)
          lastError = (err as Error).message
          loginStatus = 'idle'
          botRunning = false
          bot = null
        }
      })()

    // 等待一小段时间，让二维码 URL 显示
    await new Promise(resolve => setTimeout(resolve, 1000))

    return { success: true }
  } catch (error) {
    const errMsg = (error as Error).message || 'Unknown error'
    console.error('[ilink] 创建 Bot 失败:', errMsg)
    lastError = errMsg
    bot = null
    return { success: false, error: errMsg }
  }
}

/**
 * 停止 Bot
 */
export function stopILinkBot(): { success: boolean; error?: string } {
  if (!botRunning || !bot) {
    return { success: false, error: 'Bot is not running' }
  }

  try {
    // 子系统统一停止（含各自的 bot 引用清理）
    stopAllSubsystems()

    // WeChatBot 没有 stop 方法，直接清理状态
    shutdownAgents()

    bot = null
    botRunning = false
    botStartTime = null

    console.log('[ilink] bot stopped')
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

/**
 * 获取消息历史（从数据库读取，最近100条）
 */
export function getMessageHistory(userId: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  const db = connectDatabase()
  const rows = db.prepare(`
    SELECT role, content FROM wechat_messages
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(userId, MAX_HISTORY_LENGTH) as { role: string; content: string }[]
  return rows.reverse() as Array<{ role: 'user' | 'assistant'; content: string }>
}

/**
 * 添加消息到历史记录（持久化到数据库）
 */
export function addMessageToHistory(userId: string, role: 'user' | 'assistant', content: string): void {
  const db = connectDatabase()
  db.prepare(`
    INSERT INTO wechat_messages (user_id, role, content)
    VALUES (?, ?, ?)
  `).run(userId, role, content)

  // 删除超出限制的旧消息
  db.prepare(`
    DELETE FROM wechat_messages
    WHERE user_id = ? AND id NOT IN (
      SELECT id FROM wechat_messages
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
    )
  `).run(userId, userId, MAX_HISTORY_LENGTH)
}

/**
 * 清除消息历史
 */
export function clearMessageHistory(userId?: string): void {
  const db = connectDatabase()
  if (userId) {
    db.prepare('DELETE FROM wechat_messages WHERE user_id = ?').run(userId)
  } else {
    db.prepare('DELETE FROM wechat_messages').run()
  }
}

/**
 * 重置登录状态
 */
export function resetLoginState(): void {
  loginStatus = 'idle'
  loginQRCode = null
}
