/**
 * Allowlist sanitizer for the few `v-html` sinks that render user/imported text
 * (tag names, marks, synonyms, notifications) with light inline markup.
 *
 * Only a handful of attribute-free inline tags survive; every other tag, and every
 * stray `<` / `>`, is escaped to text. `&entity;` sequences are left alone, which is
 * safe: they only ever decode to characters, never to markup.
 */

const ALLOWED_TAG = /^<(\/?)(b|i|u|em|strong|br|code|small)\s*\/?>$/i
const HIGHLIGHT_OPEN = /^<mark(?:\s+class="(?:global-search__hl|regex-builder__mark)")?>$/i
const HIGHLIGHT_CLOSE = /^<\/mark>$/i
const TOKEN = /<[^<>]*>/g

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeText(value: string): string {
  return value.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function sanitizeInlineHtml(value: unknown): string {
  const source = value == null ? '' : String(value)
  if (!source.includes('<') && !source.includes('>')) return source

  let result = ''
  let last = 0
  for (const match of source.matchAll(TOKEN)) {
    const index = match.index ?? 0
    const token = match[0]
    result += escapeText(source.slice(last, index))
    last = index + token.length

    const simple = ALLOWED_TAG.exec(token)
    if (simple) {
      const name = simple[2].toLowerCase()
      result += name === 'br' ? '<br>' : `<${simple[1]}${name}>`
    } else if (HIGHLIGHT_OPEN.test(token)) {
      result += token.toLowerCase()
    } else if (HIGHLIGHT_CLOSE.test(token)) {
      result += '</mark>'
    } else {
      result += escapeText(token)
    }
  }
  return result + escapeText(source.slice(last))
}
