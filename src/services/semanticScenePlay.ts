/** Pick the first playlist item in the top N with a usable scene seek time. */
export function hasUsableSceneSeek(time: unknown): boolean {
  const value = Number(time)
  return Number.isFinite(value) && value > 0
}

export function hasSemanticSceneTarget(item: {
  segmentStart?: number | null
  semanticTileIndex?: number | null
} | null | undefined): boolean {
  if (!item) return false
  if (hasUsableSceneSeek(item.segmentStart)) return true
  const tile = Number(item.semanticTileIndex)
  return Number.isFinite(tile) && tile >= 0
}

export function pickFirstSeekableInTopN<T extends {
  segmentStart?: number | null
  semanticTileIndex?: number | null
}>(
  playlist: T[],
  topN = 5,
): {startIndex: number; item: T | null} {
  if (!playlist.length) return {startIndex: 0, item: null}
  const limit = Math.min(Math.max(1, Math.floor(topN)), playlist.length)
  for (let i = 0; i < limit; i += 1) {
    if (hasSemanticSceneTarget(playlist[i])) {
      return {startIndex: i, item: playlist[i]}
    }
  }
  return {startIndex: 0, item: playlist[0]}
}

export function countSeekableHits(
  hits: Array<{time?: number | null}>,
): number {
  return hits.filter((hit) => hasUsableSceneSeek(hit?.time)).length
}
