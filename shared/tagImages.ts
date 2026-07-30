/** Target width when saving tag posters (main/alt/custom, scrapers, auto-import). */
export const TAG_IMAGE_SAVE_WIDTH = 600

/** Square avatar for tag profile heading. */
export const TAG_AVATAR_SAVE_WIDTH = 320

/** Banner header width (already large enough for most displays). */
export const TAG_HEADER_SAVE_WIDTH = 1400

/** Slots included in one-time AI upscale migration (header is already large). */
export const TAG_AI_UPSCALE_TYPES = ['main', 'alt', 'custom1', 'custom2', 'avatar'] as const

export type TagAiUpscaleType = (typeof TAG_AI_UPSCALE_TYPES)[number]

const POSTER_TYPES = new Set(['main', 'alt', 'custom1', 'custom2'])

export function getTagImageSaveWidth(type: string): number | null {
  if (type === 'avatar') return TAG_AVATAR_SAVE_WIDTH
  if (type === 'header') return TAG_HEADER_SAVE_WIDTH
  if ((TAG_AI_UPSCALE_TYPES as readonly string[]).includes(type)) {
    return TAG_IMAGE_SAVE_WIDTH
  }
  return null
}

export function getTagAiUpscaleTargetWidth(type: string): number | null {
  if (type === 'avatar') return TAG_AVATAR_SAVE_WIDTH
  if (type === 'main' || type === 'alt' || type === 'custom1' || type === 'custom2') {
    return TAG_IMAGE_SAVE_WIDTH
  }
  return null
}

/**
 * Target size when an on-disk tag image exceeds app limits.
 * Posters: shrink by width to 600px, keep aspect ratio.
 * Avatar: force 320×320 (center-crop + resize).
 */
export function getTagImageDownscaleTarget(
  type: string,
  width: number,
  height: number,
): {width: number; height: number} | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null
  }

  if (type === 'avatar') {
    if (width <= TAG_AVATAR_SAVE_WIDTH && height <= TAG_AVATAR_SAVE_WIDTH) return null
    return {width: TAG_AVATAR_SAVE_WIDTH, height: TAG_AVATAR_SAVE_WIDTH}
  }

  if (POSTER_TYPES.has(type)) {
    if (width <= TAG_IMAGE_SAVE_WIDTH) return null
    const aspect = width / height
    return {
      width: TAG_IMAGE_SAVE_WIDTH,
      height: Math.max(1, Math.round(TAG_IMAGE_SAVE_WIDTH / aspect)),
    }
  }

  return null
}

export function isTagAiUpscaleType(type: string): type is TagAiUpscaleType {
  return (TAG_AI_UPSCALE_TYPES as readonly string[]).includes(type)
}

export function parseTagImageFileName(fileName: string): {tagId: string; type: string} | null {
  const match = /^(\d+)_(main|alt|custom1|custom2|avatar|header)\.(jpe?g|png|webp)$/i.exec(fileName)
  if (!match) return null
  return {tagId: match[1], type: match[2].toLowerCase()}
}
