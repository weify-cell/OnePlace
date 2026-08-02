import { describe, expect, it, vi } from 'vitest'
import {
  getReportWindow,
  getReportTypeLabel,
  isReportDue,
  type ReportType
} from '../services/wechat/report.service.js'

vi.mock('../database/index.js', async () => {
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE wechat_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      report_type TEXT NOT NULL CHECK(report_type IN ('daily','weekly','monthly')),
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(user_id, report_type, period_start)
    );
    CREATE TABLE wechat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `)
  return { connectDatabase: () => db }
})

// Task 4：mock ilink-bot 的动态 import（runAgentTurn / formatBeijingTime）。
// vi.doMock 不提升，但 generateReport 内部对该模块是运行时 await import()，
// 只要本调用先于用例执行即生效；若时序出问题可改为顶层 vi.mock。
vi.doMock('../services/wechat/ilink-bot.service.js', () => ({
  runAgentTurn: vi.fn(async () => '【日报】今天聊了项目A…'),
  formatBeijingTime: vi.fn(() => '[2026-08-02 22:00:00 星期日 北京时间]')
}))

import { queryChatRecords, saveReport, listReports, getReportById, updateReportContent, deleteReport } from '../services/wechat/report.service.js'

// 北京 = UTC+8。以下 now 均为 UTC 时刻，注释标明对应北京时间。
const DAILY_DUE = new Date('2026-08-02T14:00:00.000Z')   // 北京 2026-08-02 22:00
const DAILY_OFF = new Date('2026-08-02T14:05:00.000Z')   // 北京 2026-08-02 22:05
const SUNDAY_830 = new Date('2026-08-02T00:30:00.000Z')  // 北京 2026-08-02(周日) 08:30
const SUNDAY_800 = new Date('2026-08-02T00:00:00.000Z')  // 北京 2026-08-02(周日) 08:00
const MONDAY_800 = new Date('2026-08-03T00:00:00.000Z')  // 北京 2026-08-03(周一) 08:00
const LAST_DAY_800 = new Date('2026-08-31T00:00:00.000Z') // 北京 2026-08-31 08:00（8月最后一天）
const NOT_LAST_800 = new Date('2026-08-30T00:00:00.000Z') // 北京 2026-08-30 08:00

describe('isReportDue', () => {
  it('日报：每天 22:00 到点', () => {
    expect(isReportDue('daily', DAILY_DUE)).toBe(true)
    expect(isReportDue('daily', DAILY_OFF)).toBe(false)
  })
  it('日报：22:01 仍判到点（放宽 1 分钟容忍调度漂移，22:02 不再触发）', () => {
    expect(isReportDue('daily', new Date('2026-08-02T14:01:00.000Z'))).toBe(true) // 北京 22:01
    expect(isReportDue('daily', new Date('2026-08-02T14:02:00.000Z'))).toBe(false) // 北京 22:02
  })
  it('周报：仅周日 8:00 到点（8:01 容忍）', () => {
    expect(isReportDue('weekly', SUNDAY_800)).toBe(true)
    expect(isReportDue('weekly', new Date('2026-08-02T00:01:00.000Z'))).toBe(true) // 北京 周日 8:01
    expect(isReportDue('weekly', SUNDAY_830)).toBe(false)
    expect(isReportDue('weekly', MONDAY_800)).toBe(false)
  })
  it('月报：仅每月最后一天 8:00 到点（8:01 容忍）', () => {
    expect(isReportDue('monthly', LAST_DAY_800)).toBe(true)
    expect(isReportDue('monthly', new Date('2026-08-31T00:01:00.000Z'))).toBe(true) // 北京 8-31 8:01
    expect(isReportDue('monthly', NOT_LAST_800)).toBe(false)
  })
})

describe('getReportWindow', () => {
  it('日报窗口：当天北京 00:00 起，到 now', () => {
    const w = getReportWindow('daily', DAILY_DUE)
    expect(w.start).toBe('2026-08-01T16:00:00.000Z') // 北京 8-02 00:00
    expect(w.end).toBe('2026-08-02T14:00:00.000Z')
  })
  it('周报窗口：本周一北京 00:00 起', () => {
    const w = getReportWindow('weekly', SUNDAY_800)
    expect(w.start).toBe('2026-07-26T16:00:00.000Z') // 北京 7-27(周一) 00:00
    expect(w.end).toBe('2026-08-02T00:00:00.000Z')
  })
  it('月报窗口：本月 1 日北京 00:00 起', () => {
    const w = getReportWindow('monthly', LAST_DAY_800)
    expect(w.start).toBe('2026-07-31T16:00:00.000Z') // 北京 8-01 00:00
    expect(w.end).toBe('2026-08-31T00:00:00.000Z')
  })
  it('跨月最后一天的月报窗口正确', () => {
    const w = getReportWindow('monthly', new Date('2026-09-30T00:00:00.000Z')) // 北京 9-30 08:00
    expect(w.start).toBe('2026-08-31T16:00:00.000Z') // 北京 9-01 00:00
    expect(w.end).toBe('2026-09-30T00:00:00.000Z')
  })
})

describe('getReportTypeLabel', () => {
  it('返回中文标签', () => {
    expect(getReportTypeLabel('daily')).toBe('日报')
    expect(getReportTypeLabel('weekly')).toBe('周报')
    expect(getReportTypeLabel('monthly')).toBe('月报')
  })
})

import { connectDatabase } from '../database/index.js'

describe('queryChatRecords', () => {
  it('按窗口过滤并返回角色/内容', () => {
    const db = connectDatabase()
    const ins = db.prepare('INSERT INTO wechat_messages (user_id, role, content, created_at) VALUES (?,?,?,?)')
    ins.run('u1', 'user', '今天聊了项目A', '2026-08-02T02:00:00.000Z')
    ins.run('u1', 'assistant', '好的，项目A进度如何', '2026-08-02T02:01:00.000Z')
    ins.run('u1', 'user', '这是窗口外消息', '2026-08-01T12:00:00.000Z')

    const rows = queryChatRecords('u1', { start: '2026-08-01T16:00:00.000Z', end: '2026-08-02T14:00:00.000Z' })
    expect(rows).toHaveLength(2)
    expect(rows[0].content).toBe('今天聊了项目A')
    expect(rows[1].role).toBe('assistant')
  })
})

describe('saveReport / listReports / getReportById', () => {
  it('落表后可按类型列表、详情查询，同周期重复插入幂等', () => {
    const db = connectDatabase()
    const w = { start: '2026-08-01T16:00:00.000Z', end: '2026-08-02T14:00:00.000Z' }
    saveReport('u1', 'daily', w, '日报内容A')
    saveReport('u1', 'daily', w, '日报内容B') // 同周期，应被 UNIQUE 忽略

    const all = listReports({ type: 'daily' })
    expect(all).toHaveLength(1)
    expect(all[0].content).toBe('日报内容A')

    const byRange = listReports({ type: 'weekly', start: '2026-07-26T16:00:00.000Z', end: '2026-08-02T00:00:00.000Z' })
    expect(byRange).toHaveLength(0)

    const detail = getReportById(all[0].id)
    expect(detail?.report_type).toBe('daily')
    expect(getReportById(9999)).toBeNull()
  })
})

describe('listReports keyword / updateReportContent / deleteReport', () => {
  it('按关键词过滤内容与周期', () => {
    const db = connectDatabase()
    const w = { start: '2026-08-08T16:00:00.000Z', end: '2026-08-09T14:00:00.000Z' }
    saveReport('u2', 'daily', w, '今天聊了项目A与部署')
    const other = { start: '2026-08-09T16:00:00.000Z', end: '2026-08-10T14:00:00.000Z' }
    saveReport('u2', 'daily', other, '完全无关内容')

    expect(listReports({ type: 'daily', keyword: '部署' })).toHaveLength(1)
    // 命中 period_start 也能搜到
    expect(listReports({ type: 'daily', keyword: '2026-08-08' })).toHaveLength(1)
    expect(listReports({ type: 'daily', keyword: '不存在关键词' })).toHaveLength(0)

    db.prepare("DELETE FROM wechat_reports WHERE user_id = 'u2'").run()
  })

  it('编辑内容并返回更新行；不存在的 id 返回 null', () => {
    const db = connectDatabase()
    const w = { start: '2026-08-10T16:00:00.000Z', end: '2026-08-11T14:00:00.000Z' }
    saveReport('u3', 'daily', w, '原文')
    const row = listReports({ type: 'daily', keyword: '原文' })[0]

    const updated = updateReportContent(row.id, '编辑后的内容')
    expect(updated?.content).toBe('编辑后的内容')
    expect(getReportById(row.id)?.content).toBe('编辑后的内容')

    expect(updateReportContent(9999, 'x')).toBeNull()
    db.prepare("DELETE FROM wechat_reports WHERE user_id = 'u3'").run()
  })

  it('删除报告并返回是否实际删除', () => {
    const db = connectDatabase()
    const w = { start: '2026-08-11T16:00:00.000Z', end: '2026-08-12T14:00:00.000Z' }
    saveReport('u4', 'daily', w, '待删除')
    const row = listReports({ type: 'daily', keyword: '待删除' })[0]

    expect(deleteReport(row.id)).toBe(true)
    expect(getReportById(row.id)).toBeNull()
    expect(deleteReport(row.id)).toBe(false)
    db.prepare("DELETE FROM wechat_reports WHERE user_id = 'u4'").run()
  })
})

import { generateReport, sendAndPersist, handleReportCommand } from '../services/wechat/report.service.js'

describe('generateReport', () => {
  it('把转录文本与条数拼入 userContent 并返回总结与窗口', async () => {
    // 清空消息，保证「本次共 0 条」确定（避免依赖运行时刻的窗口）
    const db = connectDatabase()
    db.prepare('DELETE FROM wechat_messages').run()

    const result = await generateReport('u1', 'daily')
    expect(result.content).toContain('【日报】')
    expect(result.window.start).toMatch(/Z$/)

    // doMock 不提升，须在用例内动态 import 才拿到 mock 实例
    const { runAgentTurn } = await import('../services/wechat/ilink-bot.service.js')
    expect(runAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      agentId: 'report:daily:u1',
      loadHistory: false,
      removeAfterRun: true,
      systemPrompt: expect.stringContaining('日报'),
      userContent: expect.stringContaining('本次共 0 条')
    }))
  })
})

describe('handleReportCommand', () => {
  it('生成并落表，但不发送（发送由命令处理器负责）', async () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM wechat_reports').run()
    const bot = { send: vi.fn().mockResolvedValue(undefined) }

    const content = await handleReportCommand(bot as any, 'u1', 'daily')
    expect(content).toContain('【日报】')
    expect(bot.send).not.toHaveBeenCalled()
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_reports').get()).toMatchObject({ c: 1 })
  })
})

describe('sendAndPersist', () => {
  it('发送成功则落表；失败则不落表', async () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM wechat_reports').run()

    const send = vi.fn().mockResolvedValue(undefined)
    await sendAndPersist('u1', 'daily', send as any)
    expect(send).toHaveBeenCalledTimes(1)
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_reports').get()).toMatchObject({ c: 1 })

    // 同周期再触发：DB 去重（findReportByPeriod）直接跳过发送，仍 1 条
    await sendAndPersist('u1', 'daily', send as any)
    expect(send).toHaveBeenCalledTimes(1)
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_reports').get()).toMatchObject({ c: 1 })

    // 发送失败：不落表
    const badSend = vi.fn().mockRejectedValue(new Error('send fail'))
    await sendAndPersist('u1', 'weekly', badSend as any)
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_reports WHERE report_type=\'weekly\'').get()).toMatchObject({ c: 0 })
  })

  it('命令已落库（同周期）时跳过发送与落库（问题A：命令/定时冲突）', async () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM wechat_reports').run()

    // 模拟 14:00 手动 /日报 已落库：period_start 与 sendAndPersist 计算的当天北京 00:00 一致
    const w = getReportWindow('daily', new Date())
    saveReport('u1', 'daily', w, '【日报】命令版')

    const send = vi.fn().mockResolvedValue(undefined)
    await sendAndPersist('u1', 'daily', send as any)

    // 定时触发应被去重：不发送、不新增行，且保留命令版内容
    expect(send).not.toHaveBeenCalled()
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_reports').get()).toMatchObject({ c: 1 })
    expect(db.prepare('SELECT content FROM wechat_reports').get()).toMatchObject({ content: '【日报】命令版' })
  })

  it('in-flight 锁：并发重复调用只发送一次（问题B：重启双发/并发污染）', async () => {
    const db = connectDatabase()
    db.prepare('DELETE FROM wechat_reports').run()

    // 让 runAgentTurn 变慢，确保第一次生成未完成时就发起第二次调用
    const { runAgentTurn } = await import('../services/wechat/ilink-bot.service.js')
    runAgentTurn.mockImplementationOnce(() => new Promise((resolve) => setTimeout(() => resolve('【日报】慢生成'), 20)))

    const send = vi.fn().mockResolvedValue(undefined)
    const p1 = sendAndPersist('u1', 'daily', send as any)
    const p2 = sendAndPersist('u1', 'daily', send as any)
    await Promise.all([p1, p2])

    expect(send).toHaveBeenCalledTimes(1)
    expect(db.prepare('SELECT COUNT(*) c FROM wechat_reports').get()).toMatchObject({ c: 1 })
  })
})
