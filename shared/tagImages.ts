/** Target width when saving tag posters (main/alt/custom, scrapers, auto-import). */
export const TAG_IMAGE_SAVE_WIDTH = 600

/** Square avatar for tag profile heading (UI max ~160 CSS px → 2× Retina). */
export const TAG_AVATAR_SAVE_WIDTH = 328

/** Banner header width (already large enough for most displays). */
export const TAG_HEADER_SAVE_WIDTH = 1400

/** Slots included in one-time AI upscale migration (header is already large). */
export const TAG_AI_UPSCALE_TYPES = ['main', 'alt', 'custom1', 'custom2', 'avatar'] as const

export type TagAiUpscaleType = (typeof TAG_AI_UPSCALE_TYPES)[number]

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

export function isTagAiUpscaleType(type: string): type is TagAiUpscaleType {
  return (TAG_AI_UPSCALE_TYPES as readonly string[]).includes(type)
}

export function parseTagImageFileName(fileName: string): {tagId: string; type: string} | null {
  const match = /^(\d+)_(main|alt|custom1|custom2|avatar|header)\.(jpe?g|png|webp)$/i.exec(fileName)
  if (!match) return null
  return {tagId: match[1], type: match[2].toLowerCase()}
}
