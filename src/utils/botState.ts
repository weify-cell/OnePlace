/** 状态指示灯的颜色档位，对应 settings.css 里的 .status-dot--<dot> */
export type BotStateDot = 'stopped' | 'running' | 'waiting' | 'error'

export interface BotStateInput {
  /** 启用意图（持久）：只决定服务启动时是否自动拉起 */
  enabled: boolean
  /** 运行态（本次运行）：机器人此刻是否真的在收发消息 */
  running: boolean
  /** 会话状态：'expired' 表示微信侧凭证失效、只能人工重新扫码 */
  loginStatus: string | undefined
}

export interface BotState {
  dot: BotStateDot
  label: string
  /** 补在状态下方的一行说明，空串表示不需要 */
  hint: string
}

/**
 * 把「启用意图 + 运行态 + 会话状态」映射成一句给人看的状态。
 *
 * 优先级：关闭 > 运行中 > 会话过期 > 已启用未运行。
 */
export function resolveBotState(input: BotStateInput): BotState {
  if (!input.enabled) {
    return { dot: 'stopped', label: '已关闭', hint: '服务启动时不会自动拉起' }
  }

  if (input.running) {
    return { dot: 'running', label: '已启用 · 运行中', hint: '' }
  }

  if (input.loginStatus === 'expired') {
    return {
      dot: 'error',
      label: '已启用 · 会话已过期',
      hint: '需要重新扫码：请点「启动 Bot」'
    }
  }

  return { dot: 'waiting', label: '已启用 · 未运行', hint: '服务重启后会自动拉起，也可以现在手动启动' }
}
