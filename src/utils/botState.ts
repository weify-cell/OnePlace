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
 * 两件事分开表达：**状态行只回答「此刻在不在跑」**，「重启后会不会自动回来」交给 hint——
 * 因为意图不是功能总开关（见 docs/adr/0001），把两者挤进同一句会让人以为关掉开关就不能用了。
 *
 * 优先级：运行中 > 会话过期 > 未运行（意图仅影响 hint 与指示灯颜色）。
 */
export function resolveBotState(input: BotStateInput): BotState {
  // 运行态是事实，优先于意图：意图只说明「重启后会不会自动回来」，不能掩盖「此刻在跑」
  if (input.running) {
    return {
      dot: 'running',
      label: '运行中',
      hint: input.enabled ? '' : '本次是手动启动，服务重启后不会自动拉起'
    }
  }

  if (input.loginStatus === 'expired') {
    return {
      dot: 'error',
      label: '会话已过期',
      hint: '需重新扫码，请点「启动 Bot」'
    }
  }

  if (!input.enabled) {
    return { dot: 'stopped', label: '未运行', hint: '服务启动时不会自动拉起，可以手动启动' }
  }

  return { dot: 'waiting', label: '未运行', hint: '服务重启后会自动拉起，也可以现在手动启动' }
}
