/**
 * 「跳过」——机器人主动决定这一回合不发任何消息（见 CONTEXT.md）。
 *
 * 判定口径只有这一处：bot 回复与主动搭话共用它，位置推送的既有实现也搬到这里
 * （此前那份藏在 location-push.service.ts 里，别处要用只能各写一遍）。
 *
 * 匹配是**精确**的，这是有意的取舍：模型写了"SKIP（刚才没什么好说的）"会被当成
 * 普通回复发出去（一句噪音），而放宽匹配则是拿"猜意图"去换静默——猜错的代价是
 * 把该说的话咽掉。宁可听见噪音。提示词里写死"决定跳过时只回复 SKIP"来降低发生率。
 */

/** 模型用它表示"这一回合不说话"。提示词里的文本引用这个常量，不各写一遍字面量。 */
export const SKIP_TOKEN = 'SKIP'

/** 容忍模型多打的一个句末标点（`SKIP` / `skip。` / `SKIP！` 都算）。 */
export function isSkipReply(reply: string): boolean {
  return reply.trim().replace(/[。.!！]$/, '').toUpperCase() === SKIP_TOKEN
}

/** 一回合的结果：发出去、主动跳过、还是什么都没产出。 */
export type ReplyOutcome = 'send' | 'skip' | 'empty'

/**
 * 「空」和「跳过」是两件事，不能混：前者是生成异常（要记 warning 去查），
 * 后者是决定（要记冷却、不算未回复）。两者都不发消息，但账目完全不同。
 */
export function decideReplyOutcome(content: string): ReplyOutcome {
  if (!content || !content.trim()) return 'empty'
  if (isSkipReply(content)) return 'skip'
  return 'send'
}
