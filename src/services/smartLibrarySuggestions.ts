/** CLIP suggestions at/above this confidence are auto-applied in Enhance. */
export const CLIP_AUTO_APPLY_MIN_CONFIDENCE = 0.35

/** Neighbor tag frequency (across similar media) required for auto-apply. */
export const NEIGHBOR_AUTO_APPLY_MIN_COUNT = 3

export type ClipTagSuggestion = {
  word: string
  confidence: number
  mediaIds: number[]
}

export type NeighborTagSuggestion = {
  tagId: number
  metaId: number
  name: string
  count: number
  mediaIds: number[]
}

function uniquePositiveIds(ids: Array<number | string | null | undefined>): number[] {
  return [...new Set(
    ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0),
  )]
}

export function normalizeClipSuggestions(
  raw: Array<{word?: string; confidence?: number; mediaIds?: Array<number | string>}> = [],
): ClipTagSuggestion[] {
  const byWord = new Map<string, ClipTagSuggestion>()
  for (const row of raw) {
    const word = String(row?.word || '').trim()
    if (!word) continue
    const key = word.toLowerCase()
    const confidence = Number(row?.confidence)
    const mediaIds = uniquePositiveIds(row?.mediaIds || [])
    const existing = byWord.get(key)
    if (!existing) {
      byWord.set(key, {
        word,
        confidence: Number.isFinite(confidence) ? confidence : 0,
        mediaIds,
      })
      continue
    }
    existing.confidence = Math.max(
      existing.confidence,
      Number.isFinite(confidence) ? confidence : 0,
    )
    existing.mediaIds = uniquePositiveIds([...existing.mediaIds, ...mediaIds])
  }
  return [...byWord.values()]
}

export function splitClipSuggestionsByConfidence(
  suggestions: ClipTagSuggestion[],
  threshold = CLIP_AUTO_APPLY_MIN_CONFIDENCE,
): {high: ClipTagSuggestion[]; low: ClipTagSuggestion[]} {
  const high: ClipTagSuggestion[] = []
  const low: ClipTagSuggestion[] = []
  for (const row of suggestions) {
    if (row.confidence >= threshold) high.push(row)
    else low.push(row)
  }
  return {high, low}
}

export function flattenNeighborSuggestions(
  items: Array<{
    mediaId?: number
    suggestions?: Array<{tagId?: number; metaId?: number; name?: string; count?: number}>
  }> = [],
): NeighborTagSuggestion[] {
  const byKey = new Map<string, NeighborTagSuggestion>()
  for (const item of items) {
    const mediaId = Number(item?.mediaId)
    if (!Number.isFinite(mediaId) || mediaId <= 0) continue
    for (const row of item.suggestions || []) {
      const tagId = Number(row?.tagId)
      const metaId = Number(row?.metaId)
      const name = String(row?.name || '').trim()
      const count = Number(row?.count) || 0
      if (!tagId || !metaId || !name) continue
      const key = `${metaId}:${tagId}`
      const existing = byKey.get(key)
      if (!existing) {
        byKey.set(key, {tagId, metaId, name, count, mediaIds: [mediaId]})
        continue
      }
      existing.count = Math.max(existing.count, count)
      existing.mediaIds = uniquePositiveIds([...existing.mediaIds, mediaId])
    }
  }
  return [...byKey.values()]
}

export function splitNeighborSuggestionsByCount(
  suggestions: NeighborTagSuggestion[],
  minCount = NEIGHBOR_AUTO_APPLY_MIN_COUNT,
): {high: NeighborTagSuggestion[]; low: NeighborTagSuggestion[]} {
  const high: NeighborTagSuggestion[] = []
  const low: NeighborTagSuggestion[] = []
  for (const row of suggestions) {
    if (row.count >= minCount) high.push(row)
    else low.push(row)
  }
  return {high, low}
}

export function clipSuggestionLabels(suggestions: ClipTagSuggestion[]): string[] {
  return suggestions.map((row) => row.word).filter(Boolean)
}

export function neighborSuggestionLabels(suggestions: NeighborTagSuggestion[]): string[] {
  return suggestions.map((row) => row.name).filter(Boolean)
}
