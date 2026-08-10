/** Tag picker / autocomplete matching (edit dialog, mixed tags). */

export type TagAutocompleteSearchMode = 'substring' | 'chars'

/** Letters may appear with other characters between them (`fade` → favorite video). */
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

export function parseTagSynonymList(synonyms: string | null | undefined): string[] {
  return String(synonyms || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function matchesTagAutocompleteText(
  text: string,
  query: string,
  mode: TagAutocompleteSearchMode,
): boolean {
  const trimmed = String(query || '').trim()
  if (!trimmed) return true
  const lowerQuery = trimmed.toLowerCase()
  if (mode === 'substring') {
    return String(text || '').toLowerCase().includes(lowerQuery)
  }
  return foundByChars(String(text || ''), lowerQuery)
}

/** Match tag name or any synonym using typing-filter semantics. */
export function matchesTagAutocomplete(
  tag: {name?: string | null; synonyms?: string | null},
  query: string,
  mode: TagAutocompleteSearchMode,
): boolean {
  if (matchesTagAutocompleteText(tag.name || '', query, mode)) return true
  return parseTagSynonymList(tag.synonyms).some((synonym) =>
    matchesTagAutocompleteText(synonym, query, mode),
  )
}

export function resolveTagAutocompleteSearchMode(
  typingFiltersDefault: string | null | undefined,
): TagAutocompleteSearchMode {
  return typingFiltersDefault === '1' ? 'substring' : 'chars'
}
