function parseHexColor(hex: string): [number, number, number] | null {
  const normalized = hex.trim().replace('#', '')
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(normalized)) return null

  const full = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized

  const value = parseInt(full, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function toHexColor(r: number, g: number, b: number): string {
  const toHex = (channel: number) => Math.max(0, Math.min(255, Math.round(channel)))
    .toString(16)
    .padStart(2, '0')

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function mixToward(
  source: [number, number, number],
  target: [number, number, number],
  amount: number,
): [number, number, number] {
  const t = Math.max(0, Math.min(1, amount))
  return [
    source[0] + (target[0] - source[0]) * t,
    source[1] + (target[1] - source[1]) * t,
    source[2] + (target[2] - source[2]) * t,
  ]
}

/** Soft page background tinted from the theme primary color. */
export function derivePageBackground(
  primaryHex: string,
  mode: 'light' | 'dark',
  fallback = mode === 'light' ? '#fafafa' : '#121212',
): string {
  const rgb = parseHexColor(primaryHex)
  if (!rgb) return fallback

  // Light: barely-tinted near-white. Dark: sit close to Vuetify's default #121212.
  const mixed = mode === 'light'
    ? mixToward(rgb, [255, 255, 255], 0.97)
    : mixToward(rgb, [18, 18, 18], 0.94)

  return toHexColor(...mixed)
}
