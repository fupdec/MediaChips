/**
 * Multi-signal media similarity ranking.
 * Signals (clip, tags, …) stay independent; fusion uses reciprocal rank
 * so incompatible score scales (cosine vs Jaccard vs Hamming) still mix.
 */

export type MediaSimilaritySignal = 'clip' | 'tags'

export type MediaSimilaritySignalHit = {
  id: number
  /** Optional raw score for this signal (0..1 when known). */
  score?: number
}

export type MediaSimilarityHit = {
  id: number
  /** Fused ranking score (RRF). */
  score: number
  signals: Partial<Record<MediaSimilaritySignal, number>>
}

export type MediaSimilarityList = {
  signal: MediaSimilaritySignal
  /** Higher weight boosts this list's ranks in the fuse. */
  weight?: number
  /** Already ranked best-first. */
  hits: MediaSimilaritySignalHit[]
}

/** Jaccard index from shared / set sizes. */
export function jaccardSimilarity(shared: number, sizeA: number, sizeB: number): number {
  const a = Math.max(0, Number(shared) || 0)
  const left = Math.max(0, Number(sizeA) || 0)
  const right = Math.max(0, Number(sizeB) || 0)
  if (a <= 0 || left <= 0 || right <= 0) return 0
  const union = left + right - a
  if (union <= 0) return 0
  return Math.min(1, a / union)
}

/**
 * Reciprocal rank fusion across similarity lists.
 * Missing from a list ⇒ no contribution from that signal (score treated as absent).
 */
export function mergeMediaSimilarityLists(
  lists: MediaSimilarityList[],
  options: {
    limit: number
    excludeIds?: Iterable<number>
    /** RRF smoothing constant (standard default 60). */
    rrfK?: number
  },
): MediaSimilarityHit[] {
  const limit = Math.max(0, Math.floor(Number(options.limit) || 0))
  if (limit <= 0) return []

  const k = Math.max(1, Number(options.rrfK) || 60)
  const exclude = new Set(
    [...(options.excludeIds || [])]
      .map(Number)
      .filter((id) => Number.isFinite(id) && id > 0),
  )

  const byId = new Map<number, MediaSimilarityHit>()

  for (const list of lists) {
    const weight = Number(list.weight)
    const w = Number.isFinite(weight) && weight > 0 ? weight : 1
    list.hits.forEach((hit, index) => {
      const id = Number(hit.id)
      if (!Number.isFinite(id) || id <= 0 || exclude.has(id)) return
      const rank = index + 1
      const rrf = w / (k + rank)
      const existing = byId.get(id) || {id, score: 0, signals: {}}
      existing.score += rrf
      if (hit.score != null && Number.isFinite(hit.score)) {
        existing.signals[list.signal] = Number(hit.score)
      }
      byId.set(id, existing)
    })
  }

  return [...byId.values()]
    .sort((a, b) => b.score - a.score || a.id - b.id)
    .slice(0, limit)
}

/** Convenience: ranked id arrays → RRF merge. */
export function mergeMediaSimilarityIdLists(
  lists: Array<{
    signal: MediaSimilaritySignal
    weight?: number
    ids: number[]
  }>,
  options: {
    limit: number
    excludeIds?: Iterable<number>
    rrfK?: number
  },
): MediaSimilarityHit[] {
  return mergeMediaSimilarityLists(
    lists.map((list) => ({
      signal: list.signal,
      weight: list.weight,
      hits: list.ids.map((id) => ({id})),
    })),
    options,
  )
}
