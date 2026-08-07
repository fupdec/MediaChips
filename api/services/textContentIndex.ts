import fs from 'node:fs'

/** Align with in-app text preview extensions. */
export const TEXT_INDEX_EXTENSIONS = ['txt', 'html', 'htm', 'md'] as const
export const TEXT_INDEX_MAX_BYTES = 65_536
export const TEXT_EXCERPT_MAX_CHARS = 280

export type TextIndexExtension = (typeof TEXT_INDEX_EXTENSIONS)[number]

export type TextIndexPayload = {
  content: string
  excerpt: string
  truncated: boolean
}

export function getTextIndexExtension(filePath: string | null | undefined): string {
  const base = String(filePath || '').split(/[/\\]/).pop() || ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

export function isTextIndexablePath(filePath: string | null | undefined): boolean {
  const ext = getTextIndexExtension(filePath)
  return (TEXT_INDEX_EXTENSIONS as readonly string[]).includes(ext)
}

export function stripHtmlToText(html: string): string {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function looksLikeBinaryBuffer(buf: Buffer): boolean {
  if (!buf.length) return false
  const slice = buf.subarray(0, Math.min(buf.length, 4096))
  let weird = 0
  for (let i = 0; i < slice.length; i++) {
    const code = slice[i]!
    if (code === 0) return true
    if (code === 9 || code === 10 || code === 13) continue
    if (code < 32) weird += 1
  }
  return weird / slice.length > 0.05
}

export function buildContentSnippet(
  content: string,
  query: string,
  radius = 60,
): string {
  const text = String(content || '').replace(/\s+/g, ' ').trim()
  const q = String(query || '').trim()
  if (!text) return ''
  if (!q) return text.slice(0, radius * 2)

  const lower = text.toLowerCase()
  const idx = lower.indexOf(q.toLowerCase())
  if (idx < 0) return text.slice(0, radius * 2)

  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + q.length + radius)
  const snippet = text.slice(start, end)
  return `${start > 0 ? '…' : ''}${snippet}${end < text.length ? '…' : ''}`
}

export function extractTextIndexFromPath(filePath: string): TextIndexPayload | null {
  if (!isTextIndexablePath(filePath)) return null
  if (!fs.existsSync(filePath)) return null

  let fd: number | null = null
  try {
    fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(TEXT_INDEX_MAX_BYTES + 1)
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0)
    const truncated = bytesRead > TEXT_INDEX_MAX_BYTES
    const slice = buf.subarray(0, Math.min(bytesRead, TEXT_INDEX_MAX_BYTES))
    if (looksLikeBinaryBuffer(slice)) return null

    let text = slice.toString('utf8').replace(/\u0000/g, '')
    const ext = getTextIndexExtension(filePath)
    if (ext === 'html' || ext === 'htm') {
      text = stripHtmlToText(text)
    }

    const content = text
    const excerpt = content.replace(/\s+/g, ' ').trim().slice(0, TEXT_EXCERPT_MAX_CHARS)
    return {content, excerpt, truncated}
  } catch {
    return null
  } finally {
    if (fd != null) {
      try {
        fs.closeSync(fd)
      } catch {
        // ignore
      }
    }
  }
}
