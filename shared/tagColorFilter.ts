/** Sentinel for tags with no color (`color IS NULL`). */
export const TAG_COLOR_FILTER_NONE = 'none'

const HEX_COLOR_RE = /^#[0-9a-f]{3,8}$/
const HUE_STEP = 30
const GRAY_SATURATION = 0.16
const DARK_LIGHTNESS = 0.42

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

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

function hslToRgb({h, s, l}: Hsl): Rgb {
  const sat = Math.min(1, Math.max(0, s))
  const light = Math.min(1, Math.max(0, l))
  if (sat === 0) {
    const v = Math.round(light * 255)
    return {r: v, g: v, b: v}
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
  const p = 2 * light - q
  const hk = (h % 360) / 360
  return {
    r: Math.round(hue2rgb(p, q, hk + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hk) * 255),
    b: Math.round(hue2rgb(p, q, hk - 1 / 3) * 255),
  }
}

function rgbToHex({r, g, b}: Rgb): string {
  const hex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

/**
 * Snap a tag color to a coarse hue/lightness bucket so similar shades share one swatch.
 * Returns `null` for empty / invalid / no-color values.
 */
export function approximateTagColor(value: unknown): string | null {
  const normalized = normalizeTagColorFilter(value)
  if (!normalized || normalized === TAG_COLOR_FILTER_NONE) return null
  const rgb = parseTagColorRgb(normalized)
  if (!rgb) return null
  const {h, s, l} = rgbToHsl(rgb)

  if (l <= 0.08) return '#2a2a2a'
  if (l >= 0.93) return '#f2f2f2'
  if (s < GRAY_SATURATION) {
    if (l <= 0.18) return '#2a2a2a'
    if (l < 0.45) return '#6e6e6e'
    if (l < 0.72) return '#a8a8a8'
    return '#d4d4d4'
  }

  const hue = Math.round(h / HUE_STEP) * HUE_STEP % 360
  const light = l < DARK_LIGHTNESS ? 0.32 : 0.58
  const sat = s < 0.45 ? 0.52 : 0.72
  return rgbToHex(hslToRgb({h: hue, s: sat, l: light}))
}

/** Rainbow order for swatches: chromatic by hue, then grayscale. */
export function compareTagColorSwatches(a: string, b: string): number {
  const pa = parseTagColorRgb(a)
  const pb = parseTagColorRgb(b)
  if (!pa && !pb) return a.localeCompare(b)
  if (!pa) return 1
  if (!pb) return -1
  const ha = rgbToHsl(pa)
  const hb = rgbToHsl(pb)
  const aGray = ha.s < GRAY_SATURATION
  const bGray = hb.s < GRAY_SATURATION
  if (aGray !== bGray) return aGray ? 1 : -1
  if (aGray) return ha.l - hb.l
  if (ha.h !== hb.h) return ha.h - hb.h
  return ha.l - hb.l
}
