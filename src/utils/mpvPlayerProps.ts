import type {PlayerAspectMode} from '@/utils/playerAspect'
import {PLAYER_EQ_BANDS} from '@/utils/playerEqualizer'
import type {PlayerRotation} from '@/utils/playerVideoGeometry'
import type {PlayerVideoFilters} from '@/utils/playerVideoFilters'

/**
 * Translation of the player's CSS / Web Audio view settings into mpv properties.
 * With native playback the <video> element is hidden, so its transform, CSS filters and the
 * Web Audio equalizer have no effect; mpv does the same work itself.
 */

export type MpvProps = Record<string, string | number>

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const round = (value: number, digits = 3) => Math.round(value * 10 ** digits) / 10 ** digits

export interface NativeViewState {
  aspectMode: PlayerAspectMode
  rotation: PlayerRotation
  flipH: boolean
  flipV: boolean
  zoom: number
  /** Pan in screen px, as the CSS transform uses it. */
  panX: number
  panY: number
  /** Size of the video area in px; pan is expressed as a fraction of the scaled picture. */
  surface: {width: number; height: number}
  filters: PlayerVideoFilters
  equalizerGains: readonly number[]
}

/** Aspect override, stretch and cover. */
export function mpvAspectProps(mode: PlayerAspectMode): MpvProps {
  if (mode === 'stretch') return {'video-aspect-override': -1, keepaspect: 'no', panscan: 0}
  if (mode === 'cover') return {'video-aspect-override': -1, keepaspect: 'yes', panscan: 1}
  if (/^\d+:\d+$/.test(mode)) return {'video-aspect-override': mode, keepaspect: 'yes', panscan: 0}
  return {'video-aspect-override': -1, keepaspect: 'yes', panscan: 0}
}

/**
 * Flips are screen-based in the app (applied after rotation), while mpv's hflip / vflip filters
 * run on the source before `video-rotate`. A quarter turn therefore swaps the two axes.
 */
export function sourceFlips(rotation: PlayerRotation, flipH: boolean, flipV: boolean): {h: boolean; v: boolean} {
  return rotation === 90 || rotation === 270 ? {h: flipV, v: flipH} : {h: flipH, v: flipV}
}

/** mpv zoom is logarithmic (2^value); pan is a fraction of the scaled picture. */
export function mpvZoomPanProps(
  zoom: number,
  panX: number,
  panY: number,
  surface: {width: number; height: number},
): MpvProps {
  const factor = clamp(zoom, 1, 4)
  const scaledWidth = Math.max(1, surface.width * factor)
  const scaledHeight = Math.max(1, surface.height * factor)
  return {
    'video-zoom': round(Math.log2(factor), 4),
    'video-pan-x': factor > 1 ? round(clamp(panX / scaledWidth, -3, 3), 4) : 0,
    'video-pan-y': factor > 1 ? round(clamp(panY / scaledHeight, -3, 3), 4) : 0,
  }
}

/** Brightness, contrast, saturation, hue and gamma use mpv's cheap GPU controls (-100..100). */
export function mpvColorProps(filters: PlayerVideoFilters): MpvProps {
  const saturation = filters.saturation <= 1
    ? (filters.saturation - 1) * 100
    : Math.min(100, (filters.saturation - 1) * 50)
  return {
    brightness: Math.round(clamp((filters.brightness - 1) * 100, -100, 100)),
    contrast: Math.round(clamp((filters.contrast - 1) * 100, -100, 100)),
    saturation: Math.round(clamp(filters.preset === 'grayscale' ? -100 : saturation, -100, 100)),
    hue: Math.round(clamp((filters.hue / 180) * 100, -100, 100)),
    gamma: Math.round(clamp(filters.gamma > 0 ? 100 * Math.log2(filters.gamma) : 0, -100, 100)),
  }
}

const SEPIA_MATRIX = '.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0'

/** CPU filters (sharpen, blur, sepia, invert) plus the flips, as one mpv `vf` chain. */
export function mpvVideoFilterChain(
  rotation: PlayerRotation,
  flipH: boolean,
  flipV: boolean,
  filters: PlayerVideoFilters,
): string {
  const parts: string[] = []
  const flips = sourceFlips(rotation, flipH, flipV)
  if (flips.h) parts.push('hflip')
  if (flips.v) parts.push('vflip')

  const lavfi: string[] = []
  if (filters.sharpen > 0) lavfi.push(`unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=${round(filters.sharpen, 2)}`)
  if (filters.blur > 0) lavfi.push(`gblur=sigma=${round(filters.blur, 2)}`)
  if (filters.preset === 'sepia') lavfi.push(`colorchannelmixer=${SEPIA_MATRIX}`)
  if (filters.preset === 'invert') lavfi.push('negate')
  if (lavfi.length > 0) parts.push(`lavfi=[${lavfi.join(',')}]`)
  return parts.join(',')
}

/** 10-band peaking equalizer; flat bands are skipped and a flat curve clears the chain. */
export function mpvAudioFilterChain(gains: readonly number[]): string {
  const bands = PLAYER_EQ_BANDS
    .map((frequency, index) => ({frequency, gain: Number(gains[index]) || 0}))
    .filter(band => band.gain !== 0)
    .map(band => `equalizer=f=${band.frequency}:t=o:w=1:g=${round(band.gain, 1)}`)
  return bands.length > 0 ? `lavfi=[${bands.join(',')}]` : ''
}

export function buildNativeViewProps(state: NativeViewState): MpvProps {
  const vf = mpvVideoFilterChain(state.rotation, state.flipH, state.flipV, state.filters)
  return {
    // Zero-copy VideoToolbox frames live on the GPU, so the CPU filters in `vf` (flips, blur,
    // sharpen, sepia, invert) cannot see them: set `vf` and nothing visibly happens. Read the frames
    // back only while such a chain is active.
    hwdec: vf ? 'auto-copy-safe' : 'auto-safe',
    ...mpvAspectProps(state.aspectMode),
    'video-rotate': state.rotation,
    ...mpvZoomPanProps(state.zoom, state.panX, state.panY, state.surface),
    ...mpvColorProps(state.filters),
    vf,
    af: mpvAudioFilterChain(state.equalizerGains),
  }
}

/** Properties whose value differs from the last applied set (all of them on the first call). */
export function diffProps(previous: MpvProps | null, next: MpvProps): MpvProps {
  if (!previous) return next
  const changed: MpvProps = {}
  for (const [name, value] of Object.entries(next)) {
    if (previous[name] !== value) changed[name] = value
  }
  return changed
}
