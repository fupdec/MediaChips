/** Sentinel for tags with no color (`color IS NULL`). */
export const TAG_COLOR_FILTER_NONE = 'none'

const HEX_COLOR_RE = /^#[0-9a-f]{3,8}$/
/** Below this saturation / beyond these lightness bounds a color has no usable hue. */
const MIN_SATURATION = 0.15
const MIN_LIGHTNESS = 0.08
const MAX_LIGHTNESS = 0.93

/** Rainbow swatches in display order (red → violet). Every tag color snaps to the nearest hue. */
export const TAG_RAINBOW_COLORS = [
  '#e53935', // red
  '#fb8c00', // orange
  '#fdd835', // yellow
  '#43a047', // green
  '#00acc1', // cyan
  '#2962ff', // blue
  '#8e24aa', // violet
] as const

type Rgb = {r: number; g: number; b: number}
type Hsl = {h: number; s: number; l: number}

/**
 * Normalize a color-filter value from the client.
 * Returns `#rrggbb` (or stored hex), `none`, or `null` if the value is empty/invalid.
 */
export function normalizeTagColorFilter(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  if (trimmed === TAG_COLOR_FILTER_NONE) return TAG_COLOR_FILTER_NONE
  if (!HEX_COLOR_RE.test(trimmed)) return null
  return trimmed
}

export function parseTagColorRgb(value: string | null | undefined): Rgb | null {
  if (!value) return null
  const raw = value.trim()
  if (!raw.startsWith('#')) return null
  const hex = raw.slice(1)
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null

  if (hex.length === 3 || hex.length === 4) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    }
  }
  if (hex.length === 6 || hex.length === 8) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    }
  }
  return null
}

function rgbToHsl({r, g, b}: Rgb): Hsl {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return {h: 0, s: 0, l}

  const s = d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  h *= 60
  if (h < 0) h += 360
  return {h, s, l}
}

const RAINBOW_HUES = TAG_RAINBOW_COLORS.map((hex) => rgbToHsl(parseTagColorRgb(hex)!).h)

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * Snap a tag color to the nearest of the rainbow colors by hue (very coarse on purpose).
 * Returns `null` for empty / invalid / no-color values and for colors without a hue
 * (grays, near-black, near-white).
 */
export function approximateTagColor(value: unknown): string | null {
  const normalized = normalizeTagColorFilter(value)
  if (!normalized || normalized === TAG_COLOR_FILTER_NONE) return null
  const rgb = parseTagColorRgb(normalized)
  if (!rgb) return null
  const {h, s, l} = rgbToHsl(rgb)
  if (s < MIN_SATURATION || l <= MIN_LIGHTNESS || l >= MAX_LIGHTNESS) return null

  let best = 0
  for (let i = 1; i < RAINBOW_HUES.length; i++) {
    if (hueDistance(h, RAINBOW_HUES[i]) < hueDistance(h, RAINBOW_HUES[best])) best = i
  }
  return TAG_RAINBOW_COLORS[best]
}

/** Rainbow order for swatches. */
export function compareTagColorSwatches(a: string, b: string): number {
  const ia = (TAG_RAINBOW_COLORS as readonly string[]).indexOf(a)
  const ib = (TAG_RAINBOW_COLORS as readonly string[]).indexOf(b)
  return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib)
}
