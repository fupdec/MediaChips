import type { FilterCondition, FilterObject, ReadableFileSize } from '@/types/common'
import { checkColorForDarkText } from '@/utils/headerColorUtils'

interface HoverPreviewOptions {
  maxSize?: number
  defaultRatio?: number
}

export function getHoverPreviewDimensions(
  width: number,
  height: number,
  { maxSize = 180, defaultRatio = 16 / 9 }: HoverPreviewOptions = {},
): { previewWidth: number; previewHeight: number } {
  const w = Number(width) || 0
  const h = Number(height) || 0
  let ratio = defaultRatio

  if (w > 0 && h > 0) {
    ratio = w / h
  }

  ratio = Math.min(Math.max(ratio, 9 / 16), 21 / 9)

  if (ratio >= 1) {
    return {
      previewWidth: maxSize,
      previewHeight: Math.round(maxSize / ratio),
    }
  }

  return {
    previewWidth: Math.round(maxSize * ratio),
    previewHeight: maxSize,
  }
}

export function getTagHoverPreviewDimensions(
  thumbType: string,
  imageAspectRatio?: number | null,
  maxSize = 180,
): { previewWidth: number; previewHeight: number } {
  const ratio = thumbType === 'avatar'
    ? 1
    : (imageAspectRatio && imageAspectRatio > 0 ? imageAspectRatio : 1)

  return getHoverPreviewDimensions(0, 0, { maxSize, defaultRatio: ratio })
}

export function getRandomId(): string {
  return Math.random().toString(16).slice(2)
}

export function getFilterObject(obj: Partial<FilterObject> = {}): FilterObject {
  return {
    id: null,
    param: null,
    type: null,
    cond: null,
    val: null,
    note: null,
    active: true,
    lock: false,
    order: null,
    clientKey: Math.random().toString(16).slice(2),
    ...obj,
  }
}

export function getReadableFileSize(bytes: number, isObject?: false): string
export function getReadableFileSize(bytes: number, isObject: true): ReadableFileSize
export function getReadableFileSize(bytes: number, isObject = false): string | ReadableFileSize {
  const result: ReadableFileSize = { number: bytes, text: '' }

  if (bytes > 1e12) {
    result.number = (bytes / 1024 / 1024 / 1024 / 1024 - 0.01).toFixed(2)
    result.text = 'TB'
  } else if (bytes > 1e9) {
    result.number = (bytes / 1024 / 1024 / 1024 - 0.01).toFixed(2)
    result.text = 'GB'
  } else if (bytes > 1e6) {
    result.number = (bytes / 1024 / 1024 - 0.01).toFixed(2)
    result.text = 'MB'
  } else if (bytes > 1000) {
    result.number = (bytes / 1024 - 0.01).toFixed(2)
    result.text = 'KB'
  } else {
    result.text = 'B'
  }

  return isObject ? result : `${result.number} ${result.text}`
}

export function getReadableDuration(duration: number): string {
  const sec = Math.floor(duration)
  const h = (sec / 3600) ^ 0
  const m = ((sec - h * 3600) / 60) ^ 0
  const s = sec - h * 3600 - m * 60

  const hStr = h > 0 ? (h < 10 ? '0' + h + ':' : h + ':') : ''
  const mStr = m < 10 ? '0' + m : String(m)
  const sStr = s < 10 ? '0' + s : String(s)

  return hStr + mStr + ':' + sStr
}

export function getReadableBitrate(value: number): string {
  if (value > 1_000_000) return (value / 1024 / 1024 - 0.01).toFixed(0) + ' Mbps'
  if (value > 1000) return (value / 1024 - 0.01).toFixed(0) + ' Kbps'
  return value + ' bps'
}

export function getReadableVideoQuality(width: number, height: number): string {
  if (width > height) {
    if (height < 720) return 'SD'
    if (height < 1080) return 'HD'
    if (height < 1800) return 'FHD'
    return 'UHD'
  }
  return 'Vert'
}

export function getReadableVideoHeight(width: number, height: number): string {
  return height > 1800 && width > height ? '4K' : height + 'p'
}

export function getFileNameFromPath(fullPath: string): string {
  return fullPath.split('\\').pop()!.split('/').pop()!.replace(/\.[^/.]+$/, '')
}

export function getFileExtensionFromPath(fullPath: string): string {
  return fullPath.split('.').pop()!.toLowerCase()
}

export function getDateFromMs(ms: number): string {
  const date = new Date(ms)
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
}

const FILTER_DATE_LOCALES: Record<string, string> = {
  en: 'en',
  de: 'de',
  es: 'es',
  fr: 'fr',
  ru: 'ru',
  cn: 'zh-CN',
}

/** Display-only formatting for filter date values stored as YYYY-MM-DD. */
export function formatFilterDateDisplay(value: unknown, locale?: string | null): string {
  if (value == null || value === '') return ''
  const raw = String(value).trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!match) return raw

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return raw
  }

  const resolvedLocale = FILTER_DATE_LOCALES[String(locale || '')] || undefined
  return date.toLocaleDateString(resolvedLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function getDateForDB(ms?: number | null): string {
  const date = ms ? new Date(ms) : new Date()
  return date.toISOString().replace('T', ' ').replace('Z', ' +00:00')
}

export function foundByChars(text: string, query: string): boolean {
  const lowerText = text.toLowerCase()
  let foundCharIndex = 0

  for (let i = 0; i < query.length; i++) {
    const char = query[i]
    const x = lowerText.indexOf(char, foundCharIndex)
    if (x === -1) return false
    foundCharIndex = x + 1
  }
  return true
}

export function highlightChars(string: string, query: string, is_default?: boolean): string {
  const highlight = (str: string, q: string): string => {
    if (!q) return str
    const lower = str.toLowerCase()
    const index = lower.indexOf(q.toLowerCase())
    if (index >= 0) {
      return (
        str.substring(0, index) +
        '<b>' +
        str.substring(index, index + q.length) +
        '</b>' +
        str.substring(index + q.length)
      )
    }
    return str
  }

  if (is_default) return highlight(string, query)

  let res = string
  if (!query || !string) return string

  for (let i = 0; i < query.length; i++) {
    const char = query[i]
    const lastBold = res.lastIndexOf('</b>')
    if (lastBold >= 0) {
      res = res.slice(0, lastBold + 4) + highlight(res.slice(lastBold + 4), char)
    } else {
      res = highlight(res, char)
    }
  }

  return res
}

const GLOBAL_SEARCH_WORD_SPLIT = /[^\p{L}\p{N}]+/u
const GLOBAL_SEARCH_WORD_MATCH = /[\p{L}\p{N}]+/gu

function tokenMatchesSearchPart(token: string, part: string): boolean {
  if (token === part) return true
  if (!token.startsWith(part)) return false
  if (part.length <= 3) return true
  return token.length <= part.length + 2
}

function wrapGlobalSearchHighlight(text: string): string {
  return `<mark class="global-search__hl">${text}</mark>`
}

/**
 * Highlight text the same way global search matches it:
 * prefer a contiguous query match, otherwise highlight matching word prefixes.
 */
export function highlightGlobalSearchText(text: string, rawQuery: string): string {
  const source = String(text || '')
  const query = String(rawQuery || '').trim()
  if (!source || !query) return source

  const lowerSource = source.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const fullIndex = lowerSource.indexOf(lowerQuery)
  if (fullIndex >= 0) {
    return (
      source.slice(0, fullIndex)
      + wrapGlobalSearchHighlight(source.slice(fullIndex, fullIndex + query.length))
      + source.slice(fullIndex + query.length)
    )
  }

  const parts = lowerQuery.split(/\s+/).filter(Boolean)
  if (!parts.length) return source

  let result = ''
  let lastIndex = 0
  GLOBAL_SEARCH_WORD_MATCH.lastIndex = 0

  for (const match of source.matchAll(GLOBAL_SEARCH_WORD_MATCH)) {
    const token = match[0]
    const index = match.index ?? 0
    result += source.slice(lastIndex, index)

    const tokenLower = token.toLowerCase()
    const matchedPart = parts.find((part) => tokenMatchesSearchPart(tokenLower, part))
    if (matchedPart) {
      const hlLen = Math.min(matchedPart.length, token.length)
      result += wrapGlobalSearchHighlight(token.slice(0, hlLen)) + token.slice(hlLen)
    } else {
      result += token
    }

    lastIndex = index + token.length
  }

  result += source.slice(lastIndex)
  return result
}

export function textMatchesGlobalSearchQuery(text: string | null | undefined, rawQuery: string): boolean {
  const query = String(rawQuery || '').trim().toLowerCase()
  if (!query) return false

  const tokens = String(text || '')
    .toLowerCase()
    .split(GLOBAL_SEARCH_WORD_SPLIT)
    .filter(Boolean)

  if (!tokens.length) return false

  const parts = query.split(/\s+/).filter(Boolean)
  return parts.every((part) => tokens.some((token) => tokenMatchesSearchPart(token, part)))
}

export function getTextColor(color: string | null | undefined, is_outlined?: boolean): string {
  if (!color) return ''
  if (is_outlined) {
    return color
  }

  return checkColorForDarkText(color) ? 'white' : 'black'
}

export function getListCond(type: string | null | undefined): FilterCondition[] {
  if (type === 'number' || type === 'date' || type === 'rating') {
    return [
      { cond: '=', icon: 'equal', text: 'equal' },
      { cond: '!==', icon: 'not-equal-variant', text: 'not equal' },
      { cond: '>', icon: 'greater-than', text: 'greater than' },
      { cond: '<', icon: 'less-than', text: 'less than' },
      { cond: '>=', icon: 'greater-than-or-equal', text: 'greater than or equal' },
      { cond: '<=', icon: 'less-than-or-equal', text: 'less than or equal' },
    ]
  }

  if (type === 'string') {
    return [
      { cond: 'like', icon: 'equal', text: 'includes' },
      { cond: 'not like', icon: 'not-equal-variant', text: 'excludes' },
      { cond: 'under folder', icon: 'folder-outline', text: 'under folder' },
      { cond: 'starts with', icon: 'contain-start', text: 'starts with' },
      { cond: 'is null', icon: 'code-brackets', text: 'empty' },
      { cond: 'not null', icon: 'dots-horizontal', text: 'not empty' },
      { cond: 'regex', icon: 'regex', text: 'regex' },
    ]
  }

  if (type === 'array') {
    // Labels mirror includes: "excludes one of" = has none; "excludes all" = missing at least one.
    return [
      { cond: 'in', icon: 'math-norm', text: 'includes one of' },
      { cond: 'in all', icon: 'equal', text: 'includes all' },
      { cond: 'in only', icon: 'target', text: 'only' },
      { cond: 'not in', icon: 'not-equal-variant', text: 'excludes one of' },
      { cond: 'not in all', icon: 'not-equal', text: 'excludes all' },
      { cond: 'is null', icon: 'code-brackets', text: 'empty' },
      { cond: 'not null', icon: 'dots-horizontal', text: 'not empty' },
    ]
  }

  if (type === 'boolean') {
    return [
      { cond: '=', icon: 'check', text: 'yes' },
      { cond: '!=', icon: 'close', text: 'no' },
    ]
  }

  return []
}

export function validateName(str: string): true | string {
  const trimmed = str.trim().toLowerCase()
  if (trimmed.length === 0) return 'Name is required'
  if (trimmed.length > 50) return 'Name must be 50 characters or fewer'
  if (/[\\\/\%"?<>{}\[\]]/g.test(trimmed)) {
    return 'Name must not content \\/\\%\"<>{}\[\]'
  }
  return true
}

export function transformTextToArray(str: string): string[] {
  return [...new Set(str.trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean))]
}

export function hexToRgba(hex: string, opacity?: number): string {
  const normalized = hex.replace('#', '')
  const num = parseInt(normalized, 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgb(${r} ${g} ${b} / ${opacity || 100}%)`
}

export function cloneObject<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}
