export const PLAYER_ZOOM_MIN = 1
export const PLAYER_ZOOM_MAX = 4
export const PLAYER_ZOOM_STEP = 0.25

export interface PlayerPan {
  x: number
  y: number
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return PLAYER_ZOOM_MIN
  return Math.min(PLAYER_ZOOM_MAX, Math.max(PLAYER_ZOOM_MIN, Math.round(zoom * 100) / 100))
}

export function stepZoom(zoom: number, direction: 1 | -1): number {
  return clampZoom(zoom + direction * PLAYER_ZOOM_STEP)
}

/** Keeps the zoomed picture covering the container: the pan never exceeds the overflow on each side. */
export function clampPan(pan: PlayerPan, zoom: number, container: { width: number; height: number }): PlayerPan {
  if (!(zoom > 1)) return {x: 0, y: 0}
  const maxX = ((zoom - 1) * Math.max(0, container.width)) / 2
  const maxY = ((zoom - 1) * Math.max(0, container.height)) / 2
  // "+ 0" turns -0 into 0.
  return {
    x: Math.min(maxX, Math.max(-maxX, pan.x)) + 0,
    y: Math.min(maxY, Math.max(-maxY, pan.y)) + 0,
  }
}

export function zoomPercent(zoom: number): string {
  return `${Math.round(zoom * 100)}%`
}

export interface PinchStart {
  zoom: number
  pan: PlayerPan
  /** Distance between the two fingers. */
  distance: number
  /** Midpoint of the fingers relative to the centre of the picture box. */
  mid: PlayerPan
}

/**
 * Two-finger gesture: the zoom follows the finger distance and the picture point that was under the
 * midpoint stays under it, so the picture can be zoomed "into" a spot and dragged at the same time.
 * The transform is translate(pan) scale(zoom) around the box centre, hence pan = mid - zoom * pointInPicture.
 */
export function pinchTransform(
  start: PinchStart,
  now: { distance: number; mid: PlayerPan },
  container: { width: number; height: number },
): { zoom: number; pan: PlayerPan } {
  const ratio = start.distance > 0 ? now.distance / start.distance : 1
  const zoom = clampZoom(start.zoom * ratio)
  const pointX = (start.mid.x - start.pan.x) / start.zoom
  const pointY = (start.mid.y - start.pan.y) / start.zoom
  const pan = clampPan({x: now.mid.x - zoom * pointX, y: now.mid.y - zoom * pointY}, zoom, container)
  return {zoom, pan}
}

export interface SelectionRect {
  /** Top-left corner and size in px, relative to the picture container. */
  x: number
  y: number
  width: number
  height: number
}

/**
 * "Zoom to area": picks the zoom that makes the selection fill the container and the pan that puts its
 * centre in the middle. The selection is given on screen, i.e. at the current zoom and pan.
 * Returns null for a selection too small to be intentional.
 */
export function zoomToSelection(
  selection: SelectionRect,
  current: { zoom: number; pan: PlayerPan },
  container: { width: number; height: number },
  minSizePx = 24,
): { zoom: number; pan: PlayerPan } | null {
  if (selection.width < minSizePx || selection.height < minSizePx) return null
  if (!(container.width > 0) || !(container.height > 0)) return null
  const fit = Math.min(container.width / selection.width, container.height / selection.height)
  const zoom = clampZoom(current.zoom * fit)
  const centreX = selection.x + selection.width / 2 - container.width / 2
  const centreY = selection.y + selection.height / 2 - container.height / 2
  // The picture point under the selection centre, then moved to the middle at the new zoom.
  const pointX = (centreX - current.pan.x) / current.zoom
  const pointY = (centreY - current.pan.y) / current.zoom
  return {zoom, pan: clampPan({x: -zoom * pointX, y: -zoom * pointY}, zoom, container)}
}
