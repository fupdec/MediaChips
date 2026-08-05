/** Parse media-type extension lists and build path matchers. */

export function parseMediaExtensions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean)
  }
  if (typeof value !== 'string' || !value.trim()) return []
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase().replace(/^\./, ''))
    .filter(Boolean)
}

function escapeRegexPart(ext: string): string {
  return ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildExtensionRegexFromParts(parts: string[]): RegExp {
  const escaped = parts.map(escapeRegexPart).filter(Boolean)
  if (!escaped.length) {
    return /\.[^./\\]+$/i
  }
  return new RegExp(`\\.(${escaped.join('|')})$`, 'i')
}

export function buildExtensionRegex(extensions: string | null | undefined): RegExp {
  return buildExtensionRegexFromParts(parseMediaExtensions(extensions))
}

export function buildExtensionRegexFromMediaTypes(
  mediaTypes: Array<{extensions?: string | null}>,
): RegExp {
  const parts = mediaTypes.flatMap((mediaType) => parseMediaExtensions(mediaType.extensions))
  return buildExtensionRegexFromParts([...new Set(parts)])
}

export function fileMatchesExtensions(filePath: string, extensions: string[]): boolean {
  if (!extensions.length) return true
  const base = String(filePath || '').split(/[/\\]/).pop() || ''
  const dot = base.lastIndexOf('.')
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : ''
  return extensions.includes(ext)
}
