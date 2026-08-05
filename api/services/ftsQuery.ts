import type Database from 'better-sqlite3'
import {
  matchesGlobalSearchName,
  splitGlobalSearchTokens,
} from '../../shared/globalSearchMatch'

export {
  matchesGlobalSearchName,
  splitGlobalSearchTokens,
  tokenMatchesQueryPart,
  textMatchesGlobalSearchQuery,
} from '../../shared/globalSearchMatch'

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

export function matchesGlobalSearchSynonyms(
  synonyms: string | null | undefined,
  rawQuery: string,
): { matched: boolean; matchedSynonyms: string[] } {
  const parts = String(rawQuery || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!parts.length) return { matched: false, matchedSynonyms: [] }

  const matchedSynonyms: string[] = []

  for (const synonym of parseSynonymList(synonyms)) {
    if (matchesGlobalSearchName(synonym, rawQuery)) {
      matchedSynonyms.push(synonym)
    }
  }

  return { matched: matchedSynonyms.length > 0, matchedSynonyms }
}

export type GlobalSearchTagMatchSource = 'name' | 'synonym' | 'bookmark' | 'both'

export interface GlobalSearchTagResult {
  id: number
  name?: string | null
  metaId?: number | null
  synonyms?: string | null
  matchSource?: GlobalSearchTagMatchSource
  matchedSynonyms?: string[]
  matchedBookmark?: string
}

export function resolveGlobalSearchTagMatch(
  name: string | null | undefined,
  synonyms: string | null | undefined,
  rawQuery: string,
  bookmark?: string | null,
): {
  matched: boolean
  matchSource?: GlobalSearchTagMatchSource
  matchedSynonyms: string[]
  matchedBookmark?: string
} {
  const nameMatch = matchesGlobalSearchName(name, rawQuery)
  const { matched: synonymMatch, matchedSynonyms } = matchesGlobalSearchSynonyms(synonyms, rawQuery)
  const bookmarkText = bookmark == null ? '' : String(bookmark)
  const bookmarkMatch = matchesGlobalSearchName(bookmarkText, rawQuery)

  if (!nameMatch && !synonymMatch && !bookmarkMatch) {
    return { matched: false, matchedSynonyms: [] }
  }

  const sources: GlobalSearchTagMatchSource[] = []
  if (nameMatch) sources.push('name')
  if (synonymMatch) sources.push('synonym')
  if (bookmarkMatch) sources.push('bookmark')

  const matchSource: GlobalSearchTagMatchSource = sources.length > 1 ? 'both' : sources[0]

  return {
    matched: true,
    matchSource,
    matchedSynonyms,
    matchedBookmark: bookmarkMatch ? bookmarkText : undefined,
  }
}

export function isFtsSearchAvailable(sqlite: Database.Database): boolean {
  const row = sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'media_fts' LIMIT 1`,
  ).get() as { name?: string } | undefined
  return Boolean(row?.name)
}
