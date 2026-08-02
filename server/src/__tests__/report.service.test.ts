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

import { queryChatRecords, saveReport, listReports, getReportById } from '../services/wechat/report.service.js'

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
  it('周报：仅周日 8:00 到点', () => {
    expect(isReportDue('weekly', SUNDAY_800)).toBe(true)
    expect(isReportDue('weekly', SUNDAY_830)).toBe(false)
    expect(isReportDue('weekly', MONDAY_800)).toBe(false)
  })
  it('月报：仅每月最后一天 8:00 到点', () => {
    expect(isReportDue('monthly', LAST_DAY_800)).toBe(true)
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
