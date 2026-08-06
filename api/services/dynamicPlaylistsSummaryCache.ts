const SUMMARY_TTL_MS = 45_000

interface TimedSummary {
  expiresAt: number
  value: unknown
}

let cachedSummary: TimedSummary | null = null
let cachedMediaTypeId: number | null = null
let inFlight: Promise<unknown> | null = null
let inFlightMediaTypeId: number | null = null
let cacheGeneration = 0

export function getCachedDynamicPlaylistsSummary(mediaTypeId: number): unknown | null {
  if (!cachedSummary || cachedMediaTypeId !== mediaTypeId) return null
  if (cachedSummary.expiresAt <= Date.now()) {
    cachedSummary = null
    cachedMediaTypeId = null
    return null
  }
  return cachedSummary.value
}

export function setCachedDynamicPlaylistsSummary(mediaTypeId: number, value: unknown): void {
  cachedMediaTypeId = mediaTypeId
  cachedSummary = {
    value,
    expiresAt: Date.now() + SUMMARY_TTL_MS,
  }
}

export function clearDynamicPlaylistsSummaryCache(): void {
  cachedSummary = null
  cachedMediaTypeId = null
  inFlight = null
  inFlightMediaTypeId = null
  cacheGeneration += 1
}

/**
 * Coalesce concurrent cold loads for the same mediaTypeId.
 * If the cache is invalidated while work is in flight, the stale result is discarded.
 */
export async function loadDynamicPlaylistsSummaryCached<T>(
  mediaTypeId: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = getCachedDynamicPlaylistsSummary(mediaTypeId)
  if (cached != null) return cached as T

  if (inFlight && inFlightMediaTypeId === mediaTypeId) {
    return inFlight as Promise<T>
  }

  const generation = cacheGeneration
  inFlightMediaTypeId = mediaTypeId
  inFlight = (async () => {
    try {
      const value = await loader()
      if (generation === cacheGeneration) {
        setCachedDynamicPlaylistsSummary(mediaTypeId, value)
      }
      return value
    } finally {
      if (inFlightMediaTypeId === mediaTypeId) {
        inFlight = null
        inFlightMediaTypeId = null
      }
    }
  })()

  return inFlight as Promise<T>
}
