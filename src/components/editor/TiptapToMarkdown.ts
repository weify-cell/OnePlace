// Tiptap JSON → Markdown converter for migrating legacy notes

interface TiptapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  text?: string
  marks?: { type: string; attrs?: Record<string, unknown> }[]
}

function nodeToMarkdown(node: TiptapNode): string {
  if (node.type === 'text') {
    let text = node.text || ''
    if (node.marks) {
      for (const mark of node.marks) {
        switch (mark.type) {
          case 'bold':
            text = `**${text}**`
            break
          case 'italic':
            text = `*${text}*`
            break
          case 'code':
            text = `\`${text}\``
            break
          case 'strike':
            text = `~~${text}~~`
            break
          case 'link':
            text = `[${text}](${mark.attrs?.href || ''})`
            break
        }
      }
    }
    return text
  }

  if (node.type === 'paragraph') {
    const content = node.content?.map(nodeToMarkdown).join('') || ''
    return content ? `${content}\n` : '\n'
  }

  if (node.type === 'heading') {
    const level = (node.attrs?.level as number) || 1
    const content = node.content?.map(nodeToMarkdown).join('') || ''
    return `${'#'.repeat(level)} ${content}\n`
  }

  if (node.type === 'bulletList') {
    const items = node.content?.map(item => {
      const itemContent = item.content?.map(nodeToMarkdown).join('').trim() || ''
      return `- ${itemContent}`
    }).join('\n') || ''
    return `${items}\n`
  }

  if (node.type === 'orderedList') {
    const items = node.content?.map((item, idx) => {
      const itemContent = item.content?.map(nodeToMarkdown).join('').trim() || ''
      return `${idx + 1}. ${itemContent}`
    }).join('\n') || ''
    return `${items}\n`
  }

  if (node.type === 'taskList') {
    const items = node.content?.map(item => {
      const itemContent = item.content?.map(nodeToMarkdown).join('').trim() || ''
      const checked = item.attrs?.checked ? 'x' : ' '
      return `- [${checked}] ${itemContent}`
    }).join('\n') || ''
    return `${items}\n`
  }

  if (node.type === 'listItem') {
    return node.content?.map(nodeToMarkdown).join('') || ''
  }

  if (node.type === 'taskItem') {
    const content = node.content?.map(nodeToMarkdown).join('').trim() || ''
    const checked = node.attrs?.checked ? 'x' : ' '
    return `- [${checked}] ${content}\n`
  }

  if (node.type === 'blockquote') {
    const content = node.content?.map(nodeToMarkdown).join('').trim() || ''
    return `> ${content}\n`
  }

  if (node.type === 'codeBlock') {
    const language = (node.attrs?.language as string) || ''
    const content = node.content?.map(nodeToMarkdown).join('') || ''
    return `\`\`\`${language}\n${content}\`\`\`\n`
  }

  if (node.type === 'image') {
    const src = node.attrs?.src || ''
    const alt = node.attrs?.alt || ''
    return `![${alt}](${src})\n`
  }

  if (node.type === 'horizontalRule') {
    return `---\n`
  }

  if (node.type === 'hardBreak') {
    return '\n'
  }

  if (node.type === 'doc') {
    return node.content?.map(nodeToMarkdown).join('') || ''
  }

  // Unknown node type - recursively process content
  if (node.content) {
    return node.content.map(nodeToMarkdown).join('')
  }

  return ''
}

export function tiptapToMarkdown(tiptapJson: string): string {
  try {
    const parsed = JSON.parse(tiptapJson)
    if (!parsed.type && !parsed.doc) {
      // Plain text or empty
      return typeof parsed === 'string' ? parsed : ''
    }
    const doc = parsed.doc || parsed
    return nodeToMarkdown(doc).trim()
  } catch {
    // If it's not valid JSON, return as plain text
    return tiptapJson
  }
}
