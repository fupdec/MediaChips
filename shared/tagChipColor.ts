/** Default gray used when a tag never got a real color assigned. */
export const DEFAULT_TAG_COLOR = '#777'

export function isDefaultTagColor(color: string | null | undefined): boolean {
  if (color == null || color === '') return true
  const normalized = color.trim().toLowerCase()
  return normalized === '#777' || normalized === '#777777'
}

/**
 * Color to show on chips when the category has Colors enabled.
 * Only uses an explicitly saved tag color — never invents a default hue.
 */
export function resolveTagChipColor(
  colorsEnabled: boolean | null | undefined,
  tagColor: string | null | undefined,
): string | undefined {
  if (!colorsEnabled) return undefined
  if (tagColor && !isDefaultTagColor(tagColor)) return tagColor
  return undefined
}
