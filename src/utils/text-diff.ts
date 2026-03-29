import { diffChars, type Change } from 'diff'

export interface DiffOptions {
  maxRealtimeLength?: number  // 超过此长度切换为手动模式
  maxLength?: number          // 超过此长度拒绝处理
  batchSize?: number           // 分批处理大小
}

export interface DiffStats {
  totalDiffs: number
  sameChars: number
  diffChars: number
}

export interface DiffResult {
  changes: Change[]
  stats: DiffStats
}

export interface DiffPosition {
  index: number
  line: number
  col: number
  value: string
  type: 'added' | 'removed' | 'unchanged'
}

// 将字符偏移转换为行号和列号
export function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  const lines = text.substring(0, offset).split('\n')
  return {
    line: lines.length,
    col: lines[lines.length - 1].length + 1
  }
}

// 计算 diff
export function computeDiff(original: string, compare: string, options: DiffOptions = {}): DiffResult {
  const maxRealtimeLength = options.maxRealtimeLength ?? 10000
  const maxLength = options.maxLength ?? 50000

  if (original.length > maxLength || compare.length > maxLength) {
    throw new Error(`文本过长，请控制在 ${maxLength} 字符以内`)
  }

  const changes = diffChars(original, compare)

  let sameChars = 0
  let diffCharCount = 0

  for (const change of changes) {
    if (!change.added && !change.removed) {
      sameChars += change.value.length
    } else {
      diffCharCount += change.value.length
    }
  }

  const totalDiffs = changes.filter(c => c.added || c.removed).length

  return {
    changes,
    stats: {
      totalDiffs,
      sameChars,
      diffChars: diffCharCount
    }
  }
}

// 获取所有差异位置
export function getDiffPositions(changes: Change[], originalText: string, compareText: string): DiffPosition[] {
  const positions: DiffPosition[] = []
  let origOffset = 0
  let compOffset = 0

  changes.forEach((change, index) => {
    if (change.added) {
      const { line, col } = offsetToLineCol(compareText, compOffset)
      positions.push({
        index,
        line,
        col,
        value: change.value,
        type: 'added'
      })
      compOffset += change.value.length
    } else if (change.removed) {
      const { line, col } = offsetToLineCol(originalText, origOffset)
      positions.push({
        index,
        line,
        col,
        value: change.value,
        type: 'removed'
      })
      origOffset += change.value.length
    } else {
      origOffset += change.value.length
      compOffset += change.value.length
    }
  })

  return positions
}

// 生成纯文本差异报告
export function generateReport(
  result: DiffResult,
  original: string,
  compare: string,
  positions: DiffPosition[]
): string {
  const now = new Date()
  const timestamp = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

  const lines: string[] = [
    '文本差异报告',
    '==================',
    '',
    `生成时间：${timestamp}`,
    '',
    `差异总数：${result.stats.totalDiffs} 处`,
    `相同字符：${result.stats.sameChars}`,
    `差异字符：${result.stats.diffChars}`,
    '',
    '------------------'
  ]

  positions.forEach((pos, i) => {
    const typeLabel = pos.type === 'added' ? '新增' : '删除'
    lines.push('')
    lines.push(`差异 ${i + 1}/${positions.length}`)
    lines.push(`位置：第 ${pos.line} 行，第 ${pos.col} 列`)
    lines.push(`内容：「${pos.value}」`)
    lines.push(`类型：${typeLabel}`)
    lines.push('------------------')
  })

  return lines.join('\n')
}

// 计算文本长度状态
export function getTextLengthStatus(textLength: number): 'normal' | 'warning' | 'error' {
  if (textLength > 50000) {
    return 'error'
  }
  if (textLength > 10000) {
    return 'warning'
  }
  return 'normal'
}
