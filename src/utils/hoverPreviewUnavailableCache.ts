/** Per-grid cache of hover previews that already failed (avoid re-probing). */

/** Transient NAS/timeout failures should not stick for the whole session. */
export const HOVER_PREVIEW_UNAVAILABLE_TTL_MS = 60_000

const unavailableUntilByMediaId = new Map<number, number>()

function normalizeMediaId(mediaId: number | string | null | undefined): number | null {
  const id = Number(mediaId)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

function pruneExpired(now = Date.now()): void {
  for (const [id, until] of unavailableUntilByMediaId) {
    if (until <= now) unavailableUntilByMediaId.delete(id)
  }
}

export function markHoverPreviewUnavailableCached(
  mediaId: number | string | null | undefined,
  ttlMs = HOVER_PREVIEW_UNAVAILABLE_TTL_MS,
): void {
  const id = normalizeMediaId(mediaId)
  if (id == null) return
  const ttl = Math.max(0, Number(ttlMs) || HOVER_PREVIEW_UNAVAILABLE_TTL_MS)
  unavailableUntilByMediaId.set(id, Date.now() + ttl)
}

export function isHoverPreviewUnavailableCached(
  mediaId: number | string | null | undefined,
  now = Date.now(),
): boolean {
  const id = normalizeMediaId(mediaId)
  if (id == null) return false
  const until = unavailableUntilByMediaId.get(id)
  if (until == null) return false
  if (until <= now) {
    unavailableUntilByMediaId.delete(id)
    return false
  }
  return true
}

/** Drop when a new items grid replaces the current one (not infinite-scroll append). */
export function clearHoverPreviewUnavailableCache(): void {
  unavailableUntilByMediaId.clear()
}

/** Reset for tests only. */
export function resetHoverPreviewUnavailableCacheForTests(): void {
  unavailableUntilByMediaId.clear()
}

/** Test helper: force prune of expired entries. */
export function pruneHoverPreviewUnavailableCacheForTests(now = Date.now()): void {
  pruneExpired(now)
}
