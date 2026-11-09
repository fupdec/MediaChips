import {parseHexRgb} from './headerColorUtils'

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255

  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2

  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h = 0
  switch (max) {
    case rn:
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
      break
    case gn:
      h = ((bn - rn) / d + 2) / 6
      break
    case bn:
      h = ((rn - gn) / d + 4) / 6
      break
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sNorm = s / 100
  const lNorm = l / 100
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = lNorm - c / 2

  let rn = 0, gn = 0, bn = 0
  if (h < 60) { rn = c; gn = x; bn = 0 }
  else if (h < 120) { rn = x; gn = c; bn = 0 }
  else if (h < 180) { rn = 0; gn = c; bn = x }
  else if (h < 240) { rn = 0; gn = x; bn = c }
  else if (h < 300) { rn = x; gn = 0; bn = c }
  else { rn = c; gn = 0; bn = x }

  return {
    r: Math.round((rn + m) * 255),
    g: Math.round((gn + m) * 255),
    b: Math.round((bn + m) * 255),
  }
}

/** Keep the input hue, but constrain lightness for readable accents and toolbar text. */
export function derivePaletteFromBase(baseHex: string, mode: 'light' | 'dark') {
  const normalized = baseHex.trim().replace(/^#?/, '#')
  const rgb = parseHexRgb(normalized) ?? {r: 138, g: 134, b: 242}
  const {h, s} = rgbToHsl(rgb.r, rgb.g, rgb.b)
  const dark = mode === 'dark'
  const accentSaturation = Math.min(s, 72)
  const secondaryHue = (h + 35) % 360
  const color = (hue: number, saturation: number, lightness: number) => {
    const {r, g, b} = hslToRgb(hue, saturation, lightness)
    return rgbToHex(r, g, b)
  }

  return {
    header: color(h % 360, Math.min(s, 32), dark ? 17 : 92),
    headerEnd: color(secondaryHue, Math.min(s, 32), dark ? 21 : 88),
    primary: color(h % 360, accentSaturation, dark ? 89 : 23),
    secondary: color(secondaryHue, accentSaturation, dark ? 84 : 23),
  }
}

/**
 * Validates that a hex string is a valid 3- or 6-digit hex color (with or without #).
 */
export function isValidHexColor(value: string): boolean {
  const trimmed = value.trim()
  return /^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$/.test(trimmed)
}