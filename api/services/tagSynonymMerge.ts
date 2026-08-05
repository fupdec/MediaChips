/** Merge synonym CSV lists while dropping the survivor's own name. */
export function mergeSynonymLists(
  survivorName: string,
  survivorSynonyms: string | null | undefined,
  sources: Array<{name?: string | null; synonyms?: string | null}>,
): string | null {
  const byLower = new Map<string, string>()

  const addToken = (raw: string | null | undefined) => {
    if (!raw) return
    for (const part of String(raw).split(',')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      if (!byLower.has(key)) byLower.set(key, trimmed)
    }
  }

  addToken(survivorSynonyms)
  for (const source of sources) {
    addToken(source.name)
    addToken(source.synonyms)
  }

  const survivorKey = survivorName.trim().toLowerCase()
  if (survivorKey) byLower.delete(survivorKey)

  if (!byLower.size) return null
  return [...byLower.values()].join(', ')
}
