export function isCatalogSourceParam(param: unknown): boolean {
  return param === 'source' || param === 'availability'
}

/** These array filters store string tokens in filterRows.val, never tag IDs. */
export function parseCatalogSourceFilterValues(value: unknown): string[] {
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return [] }
  }
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && !!entry))]
    : []
}
