/** Per-grid cache of hover previews that already failed (avoid re-probing). */

const unavailableMediaIds = new Set<number>()

function normalizeMediaId(mediaId: number | string | null | undefined): number | null {
  const id = Number(mediaId)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

export function markHoverPreviewUnavailableCached(
  mediaId: number | string | null | undefined,
): void {
  const id = normalizeMediaId(mediaId)
  if (id == null) return
  unavailableMediaIds.add(id)
}

export function isHoverPreviewUnavailableCached(
  mediaId: number | string | null | undefined,
): boolean {
  const id = normalizeMediaId(mediaId)
  if (id == null) return false
  return unavailableMediaIds.has(id)
}

/** Drop when a new items grid replaces the current one (not infinite-scroll append). */
export function clearHoverPreviewUnavailableCache(): void {
  unavailableMediaIds.clear()
}

/** Reset for tests only. */
export function resetHoverPreviewUnavailableCacheForTests(): void {
  unavailableMediaIds.clear()
}
