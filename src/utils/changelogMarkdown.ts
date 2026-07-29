const SECTION_HEADERS = /^(Added|Changed|Fixed|Removed|Deprecated|Security)$/i

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function formatInlineMarkdown(value: string): string {
  let result = escapeHtml(value)

  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  result = result.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>')

  return result
}

export function looksLikeHtmlChangelog(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value.trim())
}

/** GitHub/electron-updater often send HTML release notes; keep-a-changelog locally is markdown. */
export function changelogNotesToHtml(notes: string): string {
  const trimmed = notes.trim()
  if (!trimmed) {
    return ''
  }

  if (looksLikeHtmlChangelog(trimmed)) {
    return trimmed
  }

  return markdownChangelogToHtml(trimmed)
}

export function changelogNotesToPlainPreview(notes: string): string {
  const trimmed = notes.trim()
  if (!trimmed) {
    return ''
  }

  const plain = decodeHtmlEntities(
    trimmed
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/^[-*]\s*/gm, '')

  const line = plain
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length > 0 && !SECTION_HEADERS.test(item))

  return line?.replace(/ — .+$/, '') || ''
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
