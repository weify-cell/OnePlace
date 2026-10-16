import { describe, expect, it } from 'vitest'
import { decideReplyOutcome, isSkipReply } from '../services/ai/skip.js'

/**
 * 「跳过」的判定。
 *
 * 这是模型主动选择"这一回合不说话"的唯一判定口径，三个出口共用
 * （bot 回复、主动搭话），位置推送也用它（原来那份实现藏在 location-push 里）。
 *
 * 精确匹配是**有意**的：宁可偶尔把"SKIP（……）"当普通回复发出去（噪音），
 * 也不要靠猜模型的意图把该说的话咽掉。
 */

describe('跳过标记的判定', () => {
  it('恰好是 SKIP → 跳过', () => {
    expect(isSkipReply('SKIP')).toBe(true)
  })

  it('容忍前后空白与一个句号/感叹号（模型爱多打一个）', () => {
    expect(isSkipReply(' skip。')).toBe(true)
    expect(isSkipReply('SKIP！')).toBe(true)
    expect(isSkipReply('\nSKIP.\n')).toBe(true)
  })

  it('加了别的内容就不算跳过（宁可发出去，也不猜）', () => {
    expect(isSkipReply('SKIP（刚才没什么好说的）')).toBe(false)
    expect(isSkipReply('好的，SKIP')).toBe(false)
    expect(isSkipReply('SKIPPING')).toBe(false)
  })

  it('空文本不是跳过（那是生成异常）', () => {
    expect(isSkipReply('')).toBe(false)
    expect(isSkipReply('   ')).toBe(false)
  })
})

describe('这一回合该发、该跳、还是出了空（三个出口共用的唯一判定）', () => {
  it('正常内容 → 发', () => {
    expect(decideReplyOutcome('今天挺忙的吧？')).toBe('send')
  })

  it('跳过标记 → 跳过', () => {
    expect(decideReplyOutcome('SKIP')).toBe('skip')
    expect(decideReplyOutcome(' skip。')).toBe('skip')
  })

  it('空或纯空白 → 空（生成异常，与"跳过"是两件事）', () => {
    expect(decideReplyOutcome('')).toBe('empty')
    expect(decideReplyOutcome('   \n ')).toBe('empty')
  })
})
