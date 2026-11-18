export const PLAYER_FILTER_PRESETS = ['none', 'grayscale', 'sepia', 'invert'] as const
export type PlayerFilterPreset = typeof PLAYER_FILTER_PRESETS[number]

export interface PlayerVideoFilters {
  brightness: number
  contrast: number
  saturation: number
  /** Degrees. */
  hue: number
  gamma: number
  /** CSS pixels of Gaussian blur. */
  blur: number
  /** Unsharp-mask strength, 0 = off. */
  sharpen: number
  preset: PlayerFilterPreset
}

export type PlayerFilterSliderKey = 'brightness' | 'contrast' | 'saturation' | 'hue' | 'gamma' | 'blur' | 'sharpen'

export const DEFAULT_PLAYER_FILTERS: Readonly<PlayerVideoFilters> = Object.freeze({
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  gamma: 1,
  blur: 0,
  sharpen: 0,
  preset: 'none',
})

export const PLAYER_FILTER_SLIDERS: ReadonlyArray<{
  key: PlayerFilterSliderKey
  min: number
  max: number
  step: number
}> = [
  {key: 'brightness', min: 0.2, max: 2, step: 0.05},
  {key: 'contrast', min: 0.2, max: 2, step: 0.05},
  {key: 'saturation', min: 0, max: 3, step: 0.05},
  {key: 'hue', min: -180, max: 180, step: 1},
  {key: 'gamma', min: 0.4, max: 2.5, step: 0.05},
  {key: 'sharpen', min: 0, max: 2, step: 0.05},
  {key: 'blur', min: 0, max: 10, step: 0.5},
]

/** SVG filter in the player markup that applies the gamma curve (CSS has no gamma filter). */
export const PLAYER_GAMMA_FILTER_ID = 'mc-player-gamma'

/** SVG filter with a 3×3 convolution that sharpens the picture (CSS has no sharpen filter). */
export const PLAYER_SHARPEN_FILTER_ID = 'mc-player-sharpen'

/** Unsharp kernel: the centre is boosted by 4×amount, the four neighbours are subtracted; the weights sum to 1. */
export function sharpenKernel(amount: number): string {
  const a = Math.max(0, amount)
  const edge = -a
  const centre = 1 + 4 * a
  return [0, edge, 0, edge, centre, edge, 0, edge, 0].map(value => String(Math.round(value * 1000) / 1000 + 0)).join(' ')
}

export function createDefaultPlayerFilters(): PlayerVideoFilters {
  return {...DEFAULT_PLAYER_FILTERS}
}

export function isDefaultPlayerFilters(filters: PlayerVideoFilters): boolean {
  return (Object.keys(DEFAULT_PLAYER_FILTERS) as Array<keyof PlayerVideoFilters>)
    .every(key => filters[key] === DEFAULT_PLAYER_FILTERS[key])
}

/** feFuncX gamma computes C^exponent, while the slider follows the usual "gamma > 1 is brighter". */
export function gammaExponent(gamma: number): number {
  return gamma > 0 ? 1 / gamma : 1
}

/** Value of the CSS `filter` property for the <video> element; empty string when nothing is changed. */
export function playerFilterCss(filters: PlayerVideoFilters): string {
  const parts: string[] = []
  if (filters.brightness !== 1) parts.push(`brightness(${filters.brightness})`)
  if (filters.contrast !== 1) parts.push(`contrast(${filters.contrast})`)
  if (filters.saturation !== 1) parts.push(`saturate(${filters.saturation})`)
  if (filters.hue !== 0) parts.push(`hue-rotate(${filters.hue}deg)`)
  if (filters.blur > 0) parts.push(`blur(${filters.blur}px)`)
  if (filters.preset !== 'none') parts.push(`${filters.preset}(1)`)
  if (filters.gamma !== 1) parts.push(`url(#${PLAYER_GAMMA_FILTER_ID})`)
  if (filters.sharpen > 0) parts.push(`url(#${PLAYER_SHARPEN_FILTER_ID})`)
  return parts.join(' ')
}
