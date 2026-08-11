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

/**
 * Vuetify maps `color` to background only for flat/elevated. For tonal/outlined/
 * text/plain the same prop drives ink/underlay — forcing contrast via `style.color`
 * washes those chips to grey pills with white text.
 */
export function tagChipNeedsContrastText(variant: string | null | undefined): boolean {
  const v = variant || 'flat'
  return v === 'flat' || v === 'elevated'
}

/** Outlined near-white chips need dark ink so the border/label stay visible. */
export function tagChipNeedsOutlinedInk(variant: string | null | undefined): boolean {
  return (variant || 'flat') === 'outlined'
}
