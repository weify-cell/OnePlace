import { getILinkConfig, startILinkBot } from './ilink-bot.service.js'

/** 延迟启动：先把端口占住，不与迁移收尾抢同一瞬间。 */
const AUTOSTART_DELAY_MS = 2000

/**
 * 服务启动时按「启用意图」自动拉起微信机器人。
 *
 * 本函数是唯一判断「要不要自动拉起」的地方：`startILinkBot()` 本身不再读启用意图，
 * 所以手动启动永远不受启用意图约束。
 */
export async function autoStartWeChatBot(): Promise<void> {
  try {
    // 延迟放在读启用意图之前：这段时间属于服务启动，任何依赖都还没稳定
    await new Promise(resolve => setTimeout(resolve, AUTOSTART_DELAY_MS))

    if (!getILinkConfig().enabled) return

    await startILinkBot()
  } catch (err) {
    console.error('[wechat] 自动启动失败：', (err as Error).message)
  }
}
