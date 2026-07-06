import type Database from 'better-sqlite3'

export interface FtsMatchOptions {
  /** Allow prefix token matching (e.g. "act" → "action"). */
  allowPrefix?: boolean
}

export function buildFtsMatchQuery(
  rawQuery: string,
  options: FtsMatchOptions = {},
): string | null {
  const allowPrefix = options.allowPrefix ?? true
  const tokens = String(rawQuery || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/"/g, '""'))
    .filter((token) => token.length > 0)

  if (!tokens.length) return null

  return tokens.map((token) => {
    if (allowPrefix) {
      return `"${token}"*`
    }
    return `"${token}"`
  }).join(' AND ')
}

export function buildTagFtsMatchQuery(rawQuery: string): string | null {
  const match = buildFtsMatchQuery(rawQuery, { allowPrefix: true })
  if (!match) return null
  return `({name} : ${match}) OR ({synonyms} : ${match})`
}

export function parseSynonymList(synonyms: string | null | undefined): string[] {
  return String(synonyms || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

const WORD_TOKEN_SPLIT = /[^\p{L}\p{N}]+/u

function tokenMatchesQueryPart(token: string, part: string): boolean {
  if (token === part) return true
  if (!token.startsWith(part)) return false

  // Short queries keep autocomplete behaviour ("act" → "action").
  if (part.length <= 3) return true

  // Longer queries avoid incidental prefixes ("anal" should not match "analise").
  return token.length <= part.length + 2
}

export function matchesGlobalSearchName(
  name: string | null | undefined,
  rawQuery: string,
): boolean {
  const query = String(rawQuery || '').trim().toLowerCase()
  if (!query) return false

  const tokens = String(name || '')
    .toLowerCase()
    .split(WORD_TOKEN_SPLIT)
    .filter(Boolean)

  if (!tokens.length) return false

  const parts = query.split(/\s+/).filter(Boolean)
  return parts.every((part) => tokens.some((token) => tokenMatchesQueryPart(token, part)))
}

export function matchesGlobalSearchSynonyms(
  synonyms: string | null | undefined,
  rawQuery: string,
): { matched: boolean; matchedSynonyms: string[] } {
  const parts = String(rawQuery || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!parts.length) return { matched: false, matchedSynonyms: [] }

  const matchedSynonyms: string[] = []

  for (const synonym of parseSynonymList(synonyms)) {
    const tokens = synonym
      .toLowerCase()
      .split(WORD_TOKEN_SPLIT)
      .filter(Boolean)

    if (parts.every((part) => tokens.some((token) => tokenMatchesQueryPart(token, part)))) {
      matchedSynonyms.push(synonym)
    }
  }

  return { matched: matchedSynonyms.length > 0, matchedSynonyms }
}

export type GlobalSearchTagMatchSource = 'name' | 'synonym' | 'both'

export interface GlobalSearchTagResult {
  id: number
  name?: string | null
  metaId?: number | null
  synonyms?: string | null
  matchSource?: GlobalSearchTagMatchSource
  matchedSynonyms?: string[]
}

export function resolveGlobalSearchTagMatch(
  name: string | null | undefined,
  synonyms: string | null | undefined,
  rawQuery: string,
): {
  matched: boolean
  matchSource?: GlobalSearchTagMatchSource
  matchedSynonyms: string[]
} {
  const nameMatch = matchesGlobalSearchName(name, rawQuery)
  const { matched: synonymMatch, matchedSynonyms } = matchesGlobalSearchSynonyms(synonyms, rawQuery)

  if (!nameMatch && !synonymMatch) {
    return { matched: false, matchedSynonyms: [] }
  }

  let matchSource: GlobalSearchTagMatchSource = 'name'
  if (nameMatch && synonymMatch) matchSource = 'both'
  else if (synonymMatch) matchSource = 'synonym'

  return { matched: true, matchSource, matchedSynonyms }
}

export function isFtsSearchAvailable(sqlite: Database.Database): boolean {
  const row = sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'media_fts' LIMIT 1`,
  ).get() as { name?: string } | undefined

  return Boolean(row?.name)
}
