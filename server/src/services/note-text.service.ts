export function extractFullPlainText(
  content: string,
  contentFormat: 'tiptap' | 'markdown' = 'tiptap'
): string {
  if (contentFormat === 'markdown') {
    return content
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/[#*`_~[\]]/g, '')
      .replace(/\n+/g, ' ')
      .trim()
  }

  try {
    const doc = JSON.parse(content)
    const texts: string[] = []

    function traverse(node: { text?: string; content?: unknown[] }) {
      if (node.text) texts.push(node.text)
      if (node.content) node.content.forEach(child => traverse(child as { text?: string; content?: unknown[] }))
    }

    traverse(doc)
    return texts.join(' ').trim()
  } catch {
    return content.trim()
  }
}

function normalizeMarkdownLine(line: string): string {
  return line
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[#*`_~[\]]/g, '')
    .trim()
}

function joinTiptapText(node: { type?: string; text?: string; content?: unknown[] }): string {
  if (node.type === 'hardBreak') return '\n'
  if (node.text) return node.text
  if (!node.content) return ''
  return node.content
    .map(child => joinTiptapText(child as { type?: string; text?: string; content?: unknown[] }))
    .join('')
}

function extractTiptapLines(node: { type?: string; text?: string; content?: unknown[] }): string[] {
  if (!node) return []
  if (node.type === 'text') return node.text ? [node.text] : []
  if (node.type === 'hardBreak') return ['\n']

  const blockTypes = new Set([
    'paragraph',
    'heading',
    'blockquote',
    'codeBlock',
    'listItem',
    'taskItem'
  ])
  const containerTypes = new Set([
    'doc',
    'bulletList',
    'orderedList',
    'taskList'
  ])

  if (blockTypes.has(node.type || '')) {
    const text = joinTiptapText(node)
    return text ? text.split('\n').map(line => line.trimEnd()) : []
  }

  if (containerTypes.has(node.type || '') || node.content) {
    return (node.content || []).flatMap(child => extractTiptapLines(child as { type?: string; text?: string; content?: unknown[] }))
  }

  return []
}

export function extractPlainTextWithLineBreaks(
  content: string,
  contentFormat: 'tiptap' | 'markdown' = 'tiptap'
): string {
  if (contentFormat === 'markdown') {
    return content
      .split(/\r?\n/)
      .map(normalizeMarkdownLine)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  try {
    const doc = JSON.parse(content) as { type?: string; text?: string; content?: unknown[] }
    return extractTiptapLines(doc)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  } catch {
    return content
      .replace(/\r\n/g, '\n')
      .trim()
  }
}
