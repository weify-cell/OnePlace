import { describe, expect, it, vi } from 'vitest'
import {
  getReportWindow,
  getReportTypeLabel,
  isReportDue,
  type ReportType
} from '../services/wechat/report.service.js'

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
