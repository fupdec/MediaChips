/** In-app text preview helpers (plaintext / simple HTML). */

export const TEXT_PREVIEW_EXTENSIONS = ['txt', 'html', 'htm', 'md'] as const

export const TEXT_PREVIEW_MAX_BYTES = 1_500_000

export type TextPreviewExtension = (typeof TEXT_PREVIEW_EXTENSIONS)[number]

export function getFileExtension(path: string | null | undefined): string {
  const base = String(path || '').split(/[/\\]/).pop() || ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

export function isInAppTextPreviewExtension(ext: string | null | undefined): boolean {
  const normalized = String(ext || '').toLowerCase()
  return (TEXT_PREVIEW_EXTENSIONS as readonly string[]).includes(normalized)
}

export function isInAppTextPreviewPath(path: string | null | undefined): boolean {
  return isInAppTextPreviewExtension(getFileExtension(path))
}

export function isHtmlTextPreviewExtension(ext: string | null | undefined): boolean {
  const normalized = String(ext || '').toLowerCase()
  return normalized === 'html' || normalized === 'htm'
}

export function extensionBadgeLabel(path: string | null | undefined): string {
  const ext = getFileExtension(path)
  return ext ? ext.toUpperCase() : 'FILE'
}

/** Detect likely binary / non-text by null bytes or high control-char ratio. */
export function looksLikeBinaryText(sample: string): boolean {
  if (!sample) return false
  if (sample.includes('\u0000')) return true
  const slice = sample.slice(0, 4096)
  if (!slice.length) return false
  let weird = 0
  for (let i = 0; i < slice.length; i++) {
    const code = slice.charCodeAt(i)
    if (code === 9 || code === 10 || code === 13) continue
    if (code < 32) weird += 1
  }
  return weird / slice.length > 0.05
}
