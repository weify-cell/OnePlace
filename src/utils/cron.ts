// Cron 表达式工具函数

export interface FieldDescription {
  field: string
  range: string
  value: string
  desc: string
}

export interface NextRunResult {
  datetime: string
  weekday: string
}

// 解析并解释 Cron 表达式
export function explainCron(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error('无效格式')

  const [min, hr, dom, mon, dow] = parts

  const explanations: string[] = []

  // 分钟解释
  if (min === '*') explanations.push('每分钟')
  else if (min.startsWith('*/')) explanations.push(`每${min.slice(2)}分钟`)
  else explanations.push(`第${min}分钟`)

  // 小时解释
  if (hr === '*') explanations.push('每小时')
  else if (hr.startsWith('*/')) explanations.push(`每${hr.slice(2)}小时`)
  else explanations.push(`${hr}点`)

  // 日期解释
  if (dom !== '*') {
    if (dom.startsWith('*/')) explanations.push(`每${dom.slice(2)}天`)
    else explanations.push(`${dom}号`)
  }

  // 月份解释
  if (mon !== '*') explanations.push(`${mon}月`)

  // 星期解释
  if (dow !== '*') {
    const dayNames: Record<string, string> = {
      '0': '周日', '1': '周一', '2': '周二', '3': '周三',
      '4': '周四', '5': '周五', '6': '周六', '7': '周日'
    }
    if (dow.includes('-')) {
      const [start, end] = dow.split('-')
      explanations.push(`${dayNames[start]}至${dayNames[end]}`)
    } else if (dow.includes(',')) {
      const days = dow.split(',').map(d => dayNames[d] || d).join('、')
      explanations.push(days)
    } else {
      explanations.push(dayNames[dow] || `周${dow}`)
    }
  }

  return explanations.join('，')
}

// 计算最近执行时间
export function calculateNextRuns(expr: string, count: number): string[] {
  try {
    const parts = expr.trim().split(/\s+/)
    if (parts.length !== 5) return []

    const [minPat, hourPat, domPat, monPat, dowPat] = parts
    const results: string[] = []
    const now = new Date()
    let current = new Date(now)
    current.setSeconds(0)
    current.setMilliseconds(0)

    const maxIterations = 5000
    let iterations = 0

  while (results.length < count && iterations < maxIterations) {
    iterations++
    current = new Date(current.getTime() + 60000)

    if (!matchesPattern(current.getMinutes(), minPat)) continue
    if (!matchesPattern(current.getHours(), hourPat)) continue
    if (!matchesPattern(current.getDate(), domPat)) continue
    if (!matchesPattern(current.getMonth() + 1, monPat)) continue
    if (!matchesPattern(current.getDay(), dowPat)) continue

    results.push(formatDateTime(current))
  }

    return results
  } catch {
    return []
  }
}

export function matchesPattern(value: number, pattern: string): boolean {
  if (pattern === '*') return true
  if (pattern.startsWith('*/')) {
    const step = parseInt(pattern.slice(2))
    return value % step === 0
  }
  if (pattern.includes(',')) {
    return pattern.split(',').some(p => matchesPattern(value, p.trim()))
  }
  if (pattern.includes('-')) {
    const [start, end] = pattern.split('-').map(Number)
    return value >= start && value <= end
  }
  return parseInt(pattern) === value
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} ${weekDays[date.getDay()]}`
}

export function isValidField(pattern: string, min: number, max: number): boolean {
  if (pattern === '*') return true
  if (pattern.startsWith('*/')) {
    const step = parseInt(pattern.slice(2))
    return !isNaN(step) && step > 0
  }
  if (pattern.includes(',')) {
    return pattern.split(',').every(p => isValidField(p.trim(), min, max))
  }
  if (pattern.includes('-')) {
    const [start, end] = pattern.split('-').map(Number)
    return !isNaN(start) && !isNaN(end) && start >= min && end <= max
  }
  const num = parseInt(pattern)
  return !isNaN(num) && num >= min && num <= max
}

export function isValidCron(expr: string): boolean {
  try {
    const parts = expr.trim().split(/\s+/)
    if (parts.length !== 5) return false

    const [min, hr, dom, mon, dow] = parts

    if (!isValidField(min, 0, 59)) return false
    if (!isValidField(hr, 0, 23)) return false
    if (!isValidField(dom, 1, 31)) return false
    if (!isValidField(mon, 1, 12)) return false
    if (!isValidField(dow, 0, 6)) return false

    return true
  } catch {
    return false
  }
}

export function generateCronFromTime(hour: number, minute: number, dayOfWeek: number): string {
  // 每天: dayOfWeek = -1, 每周: dayOfWeek = 0-6
  if (dayOfWeek === -1) {
    return `${String(minute).padStart(2, '0')} ${String(hour).padStart(2, '0')} * * *`
  }
  return `${String(minute).padStart(2, '0')} ${String(hour).padStart(2, '0')} * * ${dayOfWeek}`
}

export function parseCronExpression(expr: string): { minute: string; hour: string; dayOfMonth: string; month: string; dayOfWeek: string } | null {
  try {
    const parts = expr.trim().split(/\s+/)
    if (parts.length !== 5) return null
    return {
      minute: parts[0],
      hour: parts[1],
      dayOfMonth: parts[2],
      month: parts[3],
      dayOfWeek: parts[4]
    }
  } catch {
    return null
  }
}
