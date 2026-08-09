/** Default sample size for instant visual-search wow (grids + CLIP). */
export const VISUAL_SEARCH_QUICK_SAMPLE_SIZE = 20

export const VISUAL_SEARCH_QUICK_SAMPLE_MIN = 10
export const VISUAL_SEARCH_QUICK_SAMPLE_MAX = 50

export function clampVisualSearchQuickSampleSize(limit?: number | null): number {
  if (limit == null) return VISUAL_SEARCH_QUICK_SAMPLE_SIZE
  const n = Number(limit)
  if (!Number.isFinite(n)) return VISUAL_SEARCH_QUICK_SAMPLE_SIZE
  return Math.min(
    VISUAL_SEARCH_QUICK_SAMPLE_MAX,
    Math.max(VISUAL_SEARCH_QUICK_SAMPLE_MIN, Math.floor(n)),
  )
}
