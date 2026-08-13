/**
 * Collapse scene/part filename variants into one series key so
 * 14761_001 / 14761_002 don't flood "similar" as distinct neighbors.
 */
export function mediaSeriesKey(input: {
  name?: string | null
  basename?: string | null
  path?: string | null
}): string {
  const raw = String(input.basename || input.name || '').trim()
  if (!raw) {
    const path = String(input.path || '').replace(/\\/g, '/')
    const leaf = path.split('/').filter(Boolean).pop() || ''
    return leaf ? mediaSeriesKey({basename: leaf}) : ''
  }

  const stem = raw.replace(/\.[^.]+$/, '').trim()
  if (!stem) return ''

  const stripped = stem
    // "… part 2", "… scene 01", "… pt-3" (needs a separator so "clip-03" stays a title)
    .replace(/[\s._-]+(?:part|scene|pt|sc)[\s._-]*\d+$/i, '')
    // "14761_001", "name-02", "name 03"
    .replace(/[\s._-]+\d{1,4}$/i, '')
    .trim()

  return (stripped || stem).toLowerCase()
}

export function diversifyIdsBySeriesKey(
  rankedIds: number[],
  byId: Map<number, {
    name?: string | null
    basename?: string | null
    path?: string | null
  }>,
  options: {
    limit: number
    /** Series keys already taken (usually the seed). */
    reservedKeys?: Iterable<string>
  },
): number[] {
  const limit = Math.max(0, Math.floor(Number(options.limit) || 0))
  if (limit <= 0) return []

  const seen = new Set(
    [...(options.reservedKeys || [])]
      .map((key) => String(key || '').trim().toLowerCase())
      .filter(Boolean),
  )
  const out: number[] = []

  for (const id of rankedIds) {
    if (out.length >= limit) break
    const row = byId.get(id)
    if (!row) continue
    const key = mediaSeriesKey(row) || `id:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(id)
  }

  return out
}
