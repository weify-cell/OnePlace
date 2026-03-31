import { diffChars, diffLines, type Change } from 'diff'

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

// 行级别的差异结果（v1.7 新增）
export interface DiffChar {
  type: 'equal' | 'delete' | 'insert'
  content: string
}

export interface DiffLine {
  type: 'equal' | 'delete' | 'insert'
  content: string
  chars: DiffChar[]
}

export interface LineDiffResult {
  left: DiffLine[]    // 原文差异行
  right: DiffLine[]   // 对比文差异行
  stats: {
    deletions: number
    additions: number
  }
}

// 将字符偏移转换为行号和列号
export function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  const lines = text.substring(0, offset).split('\n')
  return {
    line: lines.length,
    col: lines[lines.length - 1].length + 1
  }
}

// 计算逐行 diff（v1.7 新增）
export function computeLineDiff(original: string, modified: string): LineDiffResult {
  const origLines = original.split('\n')
  const modLines = modified.split('\n')
  const left: DiffLine[] = []
  const right: DiffLine[] = []
  let deletions = 0
  let additions = 0

  // 空白行视为 equal，不计入统计
  const isBlankLine = (text: string) => text.trim() === ''

  // 字符级 diff（原始视角）：removed -> delete, added -> 跳过
  const charDiffLeft = (orig: string, mod: string): DiffChar[] => {
    const changes = diffChars(orig, mod)
    const chars: DiffChar[] = []
    for (const change of changes) {
      if (change.removed) {
        chars.push({ type: 'delete', content: change.value })
      } else if (!change.added) {
        chars.push({ type: 'equal', content: change.value })
      }
    }
    return chars
  }

  // 字符级 diff（对比视角）：added -> insert, removed -> 跳过
  const charDiffRight = (orig: string, mod: string): DiffChar[] => {
    const changes = diffChars(orig, mod)
    const chars: DiffChar[] = []
    for (const change of changes) {
      if (change.added) {
        chars.push({ type: 'insert', content: change.value })
      } else if (!change.removed) {
        chars.push({ type: 'equal', content: change.value })
      }
    }
    return chars
  }

  // 简单逐行比较：对应位置比较
  const maxLen = Math.max(origLines.length, modLines.length)
  for (let i = 0; i < maxLen; i++) {
    const origLine = origLines[i] ?? ''
    const modLine = modLines[i] ?? ''
    // 每行末尾加换行符（除了最后一行）
    const lf = i < maxLen - 1 ? '\n' : ''

    if (origLine === modLine) {
      // 完全相同
      left.push({ type: 'equal', content: origLine + lf, chars: charDiffLeft(origLine, modLine) })
      right.push({ type: 'equal', content: modLine + lf, chars: charDiffRight(origLine, modLine) })
    } else if (i >= origLines.length) {
      // 原文没有这一行
      if (!isBlankLine(modLine)) {
        additions++
      }
      left.push({ type: 'equal', content: lf, chars: [] })
      right.push({ type: 'insert', content: modLine + lf, chars: charDiffRight('', modLine) })
    } else if (i >= modLines.length) {
      // 对比文没有这一行
      if (!isBlankLine(origLine)) {
        deletions++
      }
      left.push({ type: 'delete', content: origLine + lf, chars: charDiffLeft(origLine, '') })
      right.push({ type: 'equal', content: lf, chars: [] })
    } else {
      // 两边都有但内容不同 - 字符级比较
      const lineDiffs = diffChars(origLine, modLine)
      for (const change of lineDiffs) {
        if (change.added) {
          additions++
        } else if (change.removed) {
          deletions++
        }
      }
      left.push({ type: 'delete', content: origLine + lf, chars: charDiffLeft(origLine, modLine) })
      right.push({ type: 'insert', content: modLine + lf, chars: charDiffRight(origLine, modLine) })
    }
  }

  return { left, right, stats: { deletions, additions } }
}

// 计算 diff（逐字符，保留向后兼容）
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

// 生成行差异格式的复制文本（v1.7 新增）
export function generateLineDiffReport(lineResult: LineDiffResult): string {
  const lines: string[] = []

  lineResult.left.forEach((line, i) => {
    if (line.type === 'delete') {
      lines.push(`【删除】第 ${i + 1} 行`)
      lines.push(`- ${line.content}`)
    }
  })

  lineResult.right.forEach((line, i) => {
    if (line.type === 'insert') {
      lines.push(`【新增】第 ${i + 1} 行`)
      lines.push(`+ ${line.content}`)
    }
  })

  lines.push(`--- 共 ${lineResult.stats.deletions} 处字符删除，${lineResult.stats.additions} 处字符新增 ---`)

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
