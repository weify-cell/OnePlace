import type { WeChatBot } from '@wechatbot/wechatbot'
import { startJob, stopAllJobs, type SubsystemJob } from './scheduler.js'
import { setDeliveryBot } from './delivery.js'
import { reminderJob } from './todo-reminder.service.js'
import { proactiveChatJob } from './proactive-chat.service.js'
import { reportJob } from './report.service.js'
import { memoryJob } from './memory.service.js'

/**
 * 微信后台子系统的组装处。
 *
 * 各子系统自己声明作业描述（名字、间隔来源、跑什么、是否需要注入 bot），
 * 这里只负责把它们拼成一份清单。因此 ilink-bot 说「启停全部子系统」，
 * 而不是按名字认识每一个——新增子系统时只改这个文件。
 */
export const WECHAT_SUBSYSTEMS: SubsystemJob[] = [
  reminderJob,
  proactiveChatJob,
  reportJob,
  memoryJob
]

/**
 * 注入依赖并启动全部子系统；已在运行的作业会被跳过。
 * bot 实例同时注入投递层：各子系统不再各自持有 bot，发送统一走 delivery。
 */
export function startAllSubsystems(bot: WeChatBot): void {
  setDeliveryBot(bot)
  for (const job of WECHAT_SUBSYSTEMS) startJob(job)
}

/** 停止全部子系统并清除投递层持有的 bot 引用。 */
export function stopAllSubsystems(): void {
  stopAllJobs()
  setDeliveryBot(null)
}

