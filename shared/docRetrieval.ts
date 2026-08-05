import documentationTranslations from './documentation/translations'
import {docs} from './documentation/structure'

export type DocChunk = {
  id: string
  title: string
  text: string
  score: number
}

const FALLBACK_LOCALE = 'en'
const MAX_CHUNK_CHARS = 1200
const MAX_TOTAL_CHARS = 4500

type DocNode = {
  id: string
  name?: string
  children?: DocNode[]
}

export function stripDocHtml(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

export function collectDocIds(nodes: DocNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node?.id) out.push(node.id)
    if (node.children?.length) collectDocIds(node.children, out)
  }
  return out
}

export function tokenizeDocText(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}_.-]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length > 1)
}

function getCatalog(locale: string): Record<string, {name?: string; content?: string}> {
  const catalogs = documentationTranslations as Record<string, Record<string, {name?: string; content?: string}>>
  return catalogs[locale] || catalogs[FALLBACK_LOCALE] || {}
}

export function buildDocChunks(locale: string): DocChunk[] {
  const catalog = getCatalog(locale)
  const fallback = getCatalog(FALLBACK_LOCALE)
  const ids = collectDocIds(docs as DocNode[])
  const chunks: DocChunk[] = []

  for (const id of ids) {
    const entry = catalog[id] || fallback[id]
    if (!entry) continue
    const title = String(entry.name || id)
    const text = stripDocHtml(String(entry.content || ''))
    if (!text && !title) continue
    chunks.push({
      id,
      title,
      text: text.slice(0, MAX_CHUNK_CHARS),
      score: 0,
    })
  }

  return chunks
}

export function scoreDocChunk(queryTokens: string[], chunk: DocChunk): number {
  if (!queryTokens.length) return 0
  const hay = tokenizeDocText(`${chunk.id} ${chunk.title} ${chunk.text}`)
  if (!hay.length) return 0
  const set = new Set(hay)
  let score = 0
  for (const token of queryTokens) {
    if (set.has(token)) score += 2
    else if (hay.some((h) => h.includes(token) || token.includes(h))) score += 1
  }
  // Prefer exact title hits
  const titleTokens = new Set(tokenizeDocText(chunk.title))
  for (const token of queryTokens) {
    if (titleTokens.has(token)) score += 3
  }
  return score
}

export function searchDocs(query: string, locale = FALLBACK_LOCALE, limit = 4): DocChunk[] {
  const q = String(query || '').trim()
  if (!q) return []
  const queryTokens = tokenizeDocText(q)
  const chunks = buildDocChunks(locale)
  const ranked = chunks
    .map((chunk) => ({...chunk, score: scoreDocChunk(queryTokens, chunk)}))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))

  const selected: DocChunk[] = []
  let total = 0
  for (const chunk of ranked) {
    if (selected.length >= limit) break
    const size = chunk.text.length + chunk.title.length
    if (total + size > MAX_TOTAL_CHARS && selected.length) break
    selected.push(chunk)
    total += size
  }
  return selected
}

export function formatDocsForPrompt(chunks: DocChunk[]): string {
  if (!chunks.length) return ''
  return chunks.map((chunk, index) => (
    `[${index + 1}] id=${chunk.id}\ntitle=${chunk.title}\n${chunk.text}`
  )).join('\n\n')
}
