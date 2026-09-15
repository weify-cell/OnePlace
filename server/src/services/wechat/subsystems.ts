import type { WeChatBot } from '@wechatbot/wechatbot'
import { startJob, stopAllJobs, type SubsystemJob } from './scheduler.js'
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
export const WECHAT_SUBSYSTEMS: Array<SubsystemJob<WeChatBot>> = [
  reminderJob,
  proactiveChatJob,
  reportJob,
  memoryJob
]

/** 注入依赖并启动全部子系统；已在运行的作业会被跳过。 */
export function startAllSubsystems(bot: WeChatBot): void {
  for (const job of WECHAT_SUBSYSTEMS) {
    job.prepare?.(bot)
    startJob(job as SubsystemJob<never>)
  }
}

/** 停止全部子系统并清理各自持有的 bot 引用。 */
export function stopAllSubsystems(): void {
  stopAllJobs()
}

/** 已注册的子系统名字（供状态查询与自检）。 */
export function listSubsystemNames(): string[] {
  return WECHAT_SUBSYSTEMS.map(job => job.name)
}
