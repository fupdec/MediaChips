import {PLAYER_ASPECT_MODES, type PlayerAspectMode} from './playerAspect'
import {rotateBy, type PlayerRotation} from './playerVideoGeometry'
import {createDefaultPlayerFilters, type PlayerVideoFilters} from './playerVideoFilters'
import {stepZoom, zoomPercent} from './playerZoom'

export type Translate = (key: string) => string

/** The part of the player store that picture hotkeys read and write. */
export interface PictureStoreLike {
  aspectMode: PlayerAspectMode
  rotation: PlayerRotation
  flipH: boolean
  flipV: boolean
  zoom: number
  panX: number
  panY: number
  videoFilters: PlayerVideoFilters
  isAudioMode?: boolean
  changePlayerStatusText?: (payload: { text: string; icon: string; subtitleKey?: string | null }) => void
}

export function aspectModeLabel(mode: PlayerAspectMode, t: Translate): string {
  if (mode === 'auto') return t('player.aspect_ratio_auto')
  if (mode === 'stretch') return t('player.aspect_ratio_stretch')
  if (mode === 'cover') return t('player.aspect_ratio_cover')
  return mode
}

export function nextAspectMode(mode: PlayerAspectMode, step: 1 | -1 = 1): PlayerAspectMode {
  const modes = PLAYER_ASPECT_MODES
  const index = modes.indexOf(mode)
  return modes[(index + step + modes.length) % modes.length]
}

export function cycleAspectMode(store: PictureStoreLike, t: Translate, step: 1 | -1 = 1): void {
  const mode = nextAspectMode(store.aspectMode, step)
  store.aspectMode = mode
  store.changePlayerStatusText?.({
    text: aspectModeLabel(mode, t),
    icon: 'aspect-ratio',
    subtitleKey: 'player.aspect_ratio_label',
  })
}

export function rotatePicture(store: PictureStoreLike, delta: 90 | -90): void {
  store.rotation = rotateBy(store.rotation, delta)
  store.changePlayerStatusText?.({
    text: `${store.rotation}°`,
    icon: delta > 0 ? 'rotate-right' : 'rotate-left',
    subtitleKey: 'player.orientation_label',
  })
}

export function flipPicture(store: PictureStoreLike, axis: 'h' | 'v', t: Translate): void {
  if (axis === 'h') store.flipH = !store.flipH
  else store.flipV = !store.flipV
  store.changePlayerStatusText?.({
    text: t(axis === 'h' ? 'player.flip_horizontal' : 'player.flip_vertical'),
    icon: axis === 'h' ? 'flip-horizontal' : 'flip-vertical',
  })
}

export function zoomPicture(store: PictureStoreLike, direction: 1 | -1): void {
  store.zoom = stepZoom(store.zoom, direction)
  if (store.zoom <= 1) {
    store.panX = 0
    store.panY = 0
  }
  store.changePlayerStatusText?.({
    text: zoomPercent(store.zoom),
    icon: direction > 0 ? 'magnify-plus-outline' : 'magnify-minus-outline',
    subtitleKey: 'player.zoom_label',
  })
}

/** Aspect ratio, orientation, zoom and colour adjustments back to the defaults. */
export function resetPicture(store: PictureStoreLike, t: Translate): void {
  store.aspectMode = 'auto'
  store.rotation = 0
  store.flipH = false
  store.flipV = false
  store.zoom = 1
  store.panX = 0
  store.panY = 0
  store.videoFilters = createDefaultPlayerFilters()
  store.changePlayerStatusText?.({text: t('player.picture_reset'), icon: 'restore'})
}
