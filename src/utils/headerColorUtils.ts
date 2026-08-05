/** Parse #rgb / #rrggbb / #rrggbbaa (alpha ignored) into 0–255 channels. */
export function parseHexRgb(
  color: string | null | undefined,
): {r: number; g: number; b: number} | null {
  if (!color) return null

  const raw = color.trim()
  if (!raw.startsWith('#')) return null

  const hex = raw.slice(1)
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null

  if (hex.length === 3 || hex.length === 4) {
    // #rgb or #rgba — expand each nibble; ignore alpha
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

function parseCssRgb(color: string): {r: number; g: number; b: number} | null {
  const m = color.match(/\d+/g)
  if (!m || m.length < 3) return null
  return {r: +m[0], g: +m[1], b: +m[2]}
}

/** True when the background is dark enough that white label text is preferable. */
export function checkColorForDarkText(color: string | null | undefined): boolean {
  if (!color) return false

  const trimmed = color.trim()
  const rgb = trimmed.startsWith('rgb')
    ? parseCssRgb(trimmed)
    : parseHexRgb(trimmed)

  if (!rgb) return false

  const {r, g, b} = rgb
  const hsp = Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b)
  return hsp < 185
}

/** True when a chip fill would disappear on a light surface (near-white). */
export function isNearWhiteColor(color: string | null | undefined): boolean {
  if (!color) return false

  const trimmed = color.trim()
  const rgb = trimmed.startsWith('rgb')
    ? parseCssRgb(trimmed)
    : parseHexRgb(trimmed)

  if (!rgb) return false

  const {r, g, b} = rgb
  const hsp = Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b)
  return hsp >= 230
}

export function hexToRgba(hex: string, opacity?: number): string {
  const rgb = parseHexRgb(hex)
  if (!rgb) return `rgb(0 0 0 / ${opacity || 100}%)`
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${opacity || 100}%)`
}

export function addTransparencyToGradient(gradientString: string, alpha = 0.75): string {
  const colorRegexes = [
    /rgb\((\d+),\s*(\d+),\s*(\d+)\)/g,
    /rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)/g,
    /#([0-9a-f]{6}|[0-9a-f]{3})(?=\s|\)|,)/gi,
  ]

  let result = gradientString

  result = result.replace(colorRegexes[0], (_match, r, g, b) => {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  })

  result = result.replace(colorRegexes[1], (_match, r, g, b) => {
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  })

  result = result.replace(colorRegexes[2], (_match, hex: string) => {
    let r: number
    let g: number
    let b: number

    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16)
      g = parseInt(hex[1] + hex[1], 16)
      b = parseInt(hex[2] + hex[2], 16)
    } else {
      r = parseInt(hex.substring(0, 2), 16)
      g = parseInt(hex.substring(2, 4), 16)
      b = parseInt(hex.substring(4, 6), 16)
    }

    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  })

  return result
}
