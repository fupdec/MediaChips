export function checkColorForDarkText(color: string | null | undefined): boolean {
  if (!color) return false

  let r: number
  let g: number
  let b: number

  if (color.startsWith('rgb')) {
    const m = color.match(/\d+/g)
    if (!m) return false
    r = +m[0]
    g = +m[1]
    b = +m[2]
  } else {
    const num = parseInt(color.slice(1), 16)
    r = (num >> 16) & 255
    g = (num >> 8) & 255
    b = num & 255
  }

  const hsp = Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b)
  return hsp < 185
}

export function hexToRgba(hex: string, opacity?: number): string {
  const normalized = hex.replace('#', '')
  const num = parseInt(normalized, 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgb(${r} ${g} ${b} / ${opacity || 100}%)`
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
