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

export function tokenMatchesQueryPart(token: string, part: string): boolean {
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

  const tokens = splitGlobalSearchTokens(name)
  if (!tokens.length) return false

  const parts = query.split(/\s+/).filter(Boolean)
  return parts.every((part) => tokens.some((token) => tokenMatchesQueryPart(token, part)))
}

/** Alias used by UI highlight helpers. */
export const textMatchesGlobalSearchQuery = matchesGlobalSearchName
