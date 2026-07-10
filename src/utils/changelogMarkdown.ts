function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatInlineMarkdown(value: string): string {
  let result = escapeHtml(value)

  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  result = result.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>')

  return result
}

export function markdownChangelogToHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/)
  const html: string[] = []
  let listItems: string[] = []

  const flushList = () => {
    if (listItems.length === 0) {
      return
    }

    html.push(`<ul>${listItems.join('')}</ul>`)
    listItems = []
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      flushList()
      continue
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushList()
      const level = Math.min(Math.max(heading[1].length, 2), 6)
      html.push(`<h${level}>${formatInlineMarkdown(heading[2])}</h${level}>`)
      continue
    }

    const listItem = trimmed.match(/^[-*]\s+(.+)$/)
    if (listItem) {
      listItems.push(`<li>${formatInlineMarkdown(listItem[1])}</li>`)
      continue
    }

    flushList()
    html.push(`<p>${formatInlineMarkdown(trimmed)}</p>`)
  }

  flushList()
  return html.join('\n')
}
