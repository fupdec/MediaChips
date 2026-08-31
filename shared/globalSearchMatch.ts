/** Shared global-search token matching (API + UI). */

const WORD_TOKEN_SPLIT = /[^\p{L}\p{N}]+/u

/**
 * Split a name into searchable tokens, including CamelCase / PascalCase parts
 * so "JulesJordan" yields both "julesjordan" and ["jules", "jordan"].
 */
export function splitGlobalSearchTokens(text: string | null | undefined): string[] {
  const source = String(text || '')
  if (!source.trim()) return []

  const withCamelBoundaries = source
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')

  const tokens = [
    ...withCamelBoundaries.toLowerCase().split(WORD_TOKEN_SPLIT),
    ...source.toLowerCase().split(WORD_TOKEN_SPLIT),
  ].filter(Boolean)

  return [...new Set(tokens)]
}

/** LIKE-style substring match used by global search highlight helpers. */
export function tokenMatchesQueryPart(token: string, part: string): boolean {
  return token.includes(part)
}

/**
 * Global search name match — same idea as SQL LIKE '%part%':
 * every whitespace-separated query part must appear as a substring.
 * CamelCase tokens are also checked so "jordan" hits "JulesJordan".
 */
export function matchesGlobalSearchName(
  name: string | null | undefined,
  rawQuery: string,
): boolean {
  const query = String(rawQuery || '').trim().toLowerCase()
  if (!query) return false

  const haystack = String(name || '').toLowerCase()
  if (!haystack) return false

  const tokens = splitGlobalSearchTokens(name)
  const parts = query.split(/\s+/).filter(Boolean)
  return parts.every(
    (part) => haystack.includes(part) || tokens.some((token) => token.includes(part)),
  )
}

/** Alias used by UI highlight helpers. */
export const textMatchesGlobalSearchQuery = matchesGlobalSearchName
