function parseHexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim()
  if (!raw.startsWith('#')) return null
  const h = raw.slice(1)
  if (!/^[0-9a-fA-F]+$/.test(h)) return null

  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    }
  }

  if (h.length === 6 || h.length === 4 || h.length === 8) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    }
  }

  return null
}

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

/**
 * Generates a harmonious theme palette from a single base color.
 *
 * For light mode:
 *  - primary: the base color (saturation boosted slightly if too dull)
 *  - secondary: hue rotated by ~45° with adjusted saturation/lightness
 *  - header: primary with slightly adjusted lightness
 *
 * For dark mode:
 *  - primary: base color lightened for readability on dark bg
 *  - secondary: hue rotated by ~45°, lightened for dark bg
 *  - header: primary, slightly brighter for dark header bars
 */
export function derivePaletteFromBase(
  baseHex: string,
  mode: 'light' | 'dark',
): { header: string; primary: string; secondary: string } {
  const rgb = parseHexToRgb(baseHex)
  if (!rgb) {
    // Return fallback defaults
    return mode === 'light'
      ? { header: '#9298EB', primary: '#8A86F2', secondary: '#F8B31A' }
      : { header: '#6E6AAD', primary: '#887ED5', secondary: '#E98700' }
  }

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)

  if (mode === 'light') {
    // Primary: boost saturation for vibrancy, keep lightness
    const primaryH = hsl.h
    const primaryS = Math.min(100, Math.max(40, hsl.s + 15))
    const primaryL = hsl.l

    // Header: light and airy — lighter than primary, gentle tint
    const headerL = Math.min(92, Math.max(70, primaryL + 30))
    const headerS = Math.max(5, Math.round(primaryS * 0.35))

    // Secondary: hue shifted ~45°, adjusted saturation, slightly warmer/lighter
    const secondaryH = (primaryH + 45) % 360
    const secondaryS = Math.min(85, Math.max(35, hsl.s + 10))
    const secondaryL = Math.min(80, Math.max(45, primaryL + 5))

    const primaryRgb = hslToRgb(primaryH, primaryS, primaryL)
    const headerRgb = hslToRgb(primaryH, headerS, headerL)
    const secondaryRgb = hslToRgb(secondaryH, secondaryS, secondaryL)

    return {
      header: rgbToHex(headerRgb.r, headerRgb.g, headerRgb.b),
      primary: rgbToHex(primaryRgb.r, primaryRgb.g, primaryRgb.b),
      secondary: rgbToHex(secondaryRgb.r, secondaryRgb.g, secondaryRgb.b),
    }
  }

  // Dark mode
  // Primary: lighten the base for readability on dark bg
  const primaryH = hsl.h
  const primaryS = Math.min(90, Math.max(30, hsl.s))
  const primaryL = Math.min(75, Math.max(40, hsl.l + 20))

  // Header: moody and deep — darker than primary, subtle presence
  const headerL = Math.min(65, Math.max(35, primaryL - 5))
  const headerS = Math.max(6, Math.round(primaryS * 0.55))

  // Secondary: hue shifted ~45°, lightened for dark bg
  const secondaryH = (primaryH + 45) % 360
  const secondaryS = Math.min(80, Math.max(30, hsl.s))
  const secondaryL = Math.min(80, Math.max(45, primaryL + 10))

  const primaryRgb = hslToRgb(primaryH, primaryS, primaryL)
  const headerRgb = hslToRgb(primaryH, headerS, headerL)
  const secondaryRgb = hslToRgb(secondaryH, secondaryS, secondaryL)

  return {
    header: rgbToHex(headerRgb.r, headerRgb.g, headerRgb.b),
    primary: rgbToHex(primaryRgb.r, primaryRgb.g, primaryRgb.b),
    secondary: rgbToHex(secondaryRgb.r, secondaryRgb.g, secondaryRgb.b),
  }
}

/**
 * Validates that a hex string is a valid 3- or 6-digit hex color (with or without #).
 */
export function isValidHexColor(value: string): boolean {
  const trimmed = value.trim()
  return /^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$/.test(trimmed)
}