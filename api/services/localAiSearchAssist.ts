import type {ApiDb} from '../types/db'
import {searchTagsByName} from './globalSearch'

export type SearchAssistCandidateTag = {
  id: number
  name: string
  metaId?: number | null
}

export type SearchAssistParsed = {
  query: string
  tags: string[]
  tagIds: number[]
  explanation: string
}

/** Split NL into tokens for candidate tag lookup. */
export function tokenizeSearchAssistQuery(q: string): string[] {
  return String(q || '')
    .replace(/^(ai|ии)\s*:\s*/i, '')
    .split(/[\s,;|/]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
}

/**
 * Light tag shortlist for the LLM (~30 max). Prefer full-query hit, then per-token.
 */
export async function buildSearchAssistCandidates(
  db: ApiDb,
  q: string,
  limit = 30,
): Promise<SearchAssistCandidateTag[]> {
  const cleaned = String(q || '').replace(/^(ai|ии)\s*:\s*/i, '').trim()
  if (!cleaned) return []

  const byId = new Map<number, SearchAssistCandidateTag>()
  const addRows = (rows: Array<{id?: number | string; name?: string | null; metaId?: number | null}>) => {
    for (const row of rows) {
      const id = Number(row.id)
      if (!Number.isFinite(id) || id <= 0 || byId.has(id)) continue
      byId.set(id, {
        id,
        name: String(row.name || '').trim(),
        metaId: row.metaId == null ? null : Number(row.metaId),
      })
      if (byId.size >= limit) return
    }
  }

  addRows(await searchTagsByName(db, cleaned, {limit}))
  if (byId.size < limit) {
    for (const token of tokenizeSearchAssistQuery(cleaned)) {
      if (byId.size >= limit) break
      addRows(await searchTagsByName(db, token, {limit: Math.min(12, limit - byId.size)}))
    }
  }

  return [...byId.values()].filter((tag) => tag.name)
}

export function buildSearchAssistPrompt(context: Record<string, unknown>): string[] {
  const q = String(context.q || context.goal || '').trim()
  const candidates = Array.isArray(context.candidateTags) ? context.candidateTags : []
  const lines = candidates.slice(0, 40).map((raw) => {
    const tag = raw as SearchAssistCandidateTag
    return `- ${JSON.stringify(String(tag.name || ''))} (id ${Number(tag.id) || 0})`
  })

  return [
    'Interpret a MediaChips global-search request.',
    'Return ONLY JSON (no markdown) with keys: query, tags, explanation.',
    '- query = residual free-text for FTS (may be empty string).',
    '- tags = array of EXACT tag names chosen ONLY from candidateTags below (0–5 names).',
    '- explanation = one short sentence in the UI language.',
    'Do not invent tag names that are not listed. Prefer pinning specific people/studios/categories; leave descriptive scene words in query.',
    `User request: ${JSON.stringify(q)}`,
    'candidateTags:',
    ...(lines.length ? lines : ['- (none)']),
  ]
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
}

/** Resolve model tag names strictly against the candidate shortlist. */
export function normalizeSearchAssistParsed(
  parsed: Record<string, unknown> | null,
  context: Record<string, unknown> = {},
): SearchAssistParsed | null {
  if (!parsed || typeof parsed !== 'object') return null

  const candidates = Array.isArray(context.candidateTags)
    ? (context.candidateTags as SearchAssistCandidateTag[])
    : []
  const byName = new Map<string, SearchAssistCandidateTag>()
  for (const tag of candidates) {
    const name = String(tag?.name || '').trim()
    if (!name) continue
    byName.set(name.toLowerCase(), {
      id: Number(tag.id),
      name,
      metaId: tag.metaId ?? null,
    })
  }

  const requested = asStringArray(parsed.tags)
  const resolvedNames: string[] = []
  const tagIds: number[] = []
  for (const name of requested) {
    const hit = byName.get(name.toLowerCase())
    if (!hit || !Number.isFinite(hit.id) || hit.id <= 0) continue
    if (tagIds.includes(hit.id)) continue
    tagIds.push(hit.id)
    resolvedNames.push(hit.name)
  }

  const query = String(parsed.query ?? '').trim()
  const explanation = String(parsed.explanation ?? '').trim()

  return {
    query,
    tags: resolvedNames,
    tagIds,
    explanation,
  }
}
