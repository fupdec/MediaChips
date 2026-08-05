/** Deduplicate positive numeric IDs while preserving first-seen order. */
export function uniquePositiveIds(ids: unknown[]): number[] {
  const seen = new Set<number>()
  const result: number[] = []
  for (const raw of ids) {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

/** Keep last item per key (Map overwrite semantics). */
export function uniqueByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const map = new Map<string, T>()
  for (const item of items) map.set(keyFn(item), item)
  return [...map.values()]
}
