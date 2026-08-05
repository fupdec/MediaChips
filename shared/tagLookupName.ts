/** Shared tag name / synonym lookup helpers (API + UI). */

export type TagLookupLike = {
  name?: string | null
  synonyms?: string | null
}

export function normalizeTagLookupName(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

export function compactTagLookupName(value: unknown): string {
  return normalizeTagLookupName(value).replace(/\s+/g, '')
}

/** Unique normalized primary name + synonyms. */
export function getTagLookupNames(tag: TagLookupLike): string[] {
  const names = new Set<string>()
  const primaryName = normalizeTagLookupName(tag.name)
  if (primaryName) names.add(primaryName)

  if (tag.synonyms) {
    for (const synonym of String(tag.synonyms).split(',')) {
      const normalized = normalizeTagLookupName(synonym)
      if (normalized) names.add(normalized)
    }
  }

  return [...names]
}

/**
 * Ordered name + synonym terms (duplicates possible before normalize filter).
 * Used by path-regex resolution which matches exact normalized terms only.
 */
export function getTagLookupTerms(tag: TagLookupLike): string[] {
  const synonyms = String(tag.synonyms || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  return [tag.name, ...synonyms]
    .map(normalizeTagLookupName)
    .filter(Boolean)
}

export function tagMatchesLookupName(
  tag: TagLookupLike,
  lookupName: string,
  options: {compact?: boolean} = {},
): boolean {
  const normalized = normalizeTagLookupName(lookupName)
  if (!normalized) return false

  const lookupNames = getTagLookupNames(tag)
  if (lookupNames.includes(normalized)) return true

  if (options.compact === false) return false

  const compactLookup = compactTagLookupName(lookupName)
  if (!compactLookup) return false

  return lookupNames.some((name) => compactTagLookupName(name) === compactLookup)
}
