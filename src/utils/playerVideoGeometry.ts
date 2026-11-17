import {aspectModeRatio, fitAspectBox, type PlayerAspectMode} from './playerAspect'

export type PlayerRotation = 0 | 90 | 180 | 270

export interface PlayerVideoGeometry {
  aspectMode: PlayerAspectMode
  rotation: PlayerRotation
  flipH: boolean
  flipV: boolean
  /** 1 = no zoom. Zoom and pan are applied on screen, after the rotation and flips. */
  zoom?: number
  /** Pan in px, already limited to the zoomed overflow. */
  panX?: number
  panY?: number
}

export function rotateBy(rotation: PlayerRotation, delta: 90 | -90): PlayerRotation {
  return ((((rotation + delta) % 360) + 360) % 360) as PlayerRotation
}

export function isDefaultOrientation(geometry: Pick<PlayerVideoGeometry, 'rotation' | 'flipH' | 'flipV'>): boolean {
  return geometry.rotation === 0 && !geometry.flipH && !geometry.flipV
}

/** Flips are screen-based (applied after the rotation), so "mirror" stays a left-right mirror at any angle. */
function orientationTransform(
  {rotation, flipH, flipV, zoom = 1, panX = 0, panY = 0}: Omit<PlayerVideoGeometry, 'aspectMode'>,
): string {
  const parts: string[] = []
  if (panX !== 0 || panY !== 0) parts.push(`translate(${panX}px, ${panY}px)`)
  if (zoom !== 1) parts.push(`scale(${zoom})`)
  if (flipH || flipV) parts.push(`scale(${flipH ? -1 : 1}, ${flipV ? -1 : 1})`)
  if (rotation !== 0) parts.push(`rotate(${rotation}deg)`)
  return parts.join(' ')
}

/**
 * Inline style for the player <video> element.
 * The aspect mode describes the picture the user sees (after rotation). With a quarter turn
 * the element box is built swapped, so that the rotated picture fills the container.
 */
export function playerVideoStyle(
  geometry: PlayerVideoGeometry,
  containerWidth: number,
  containerHeight: number,
): Record<string, string> {
  const {aspectMode, rotation} = geometry
  const style: Record<string, string> = {}
  const transform = orientationTransform(geometry)
  if (transform) style.transform = transform

  const quarterTurn = rotation === 90 || rotation === 270
  const ratio = aspectModeRatio(aspectMode)

  if (aspectMode === 'stretch') style.objectFit = 'fill'
  else if (aspectMode === 'cover') style.objectFit = 'cover'
  else if (ratio != null) style.objectFit = 'fill'

  // Picture size on screen (after rotation) when it cannot simply be the container.
  let displayed: { width: number; height: number } | null = null
  if (ratio != null) displayed = fitAspectBox(containerWidth, containerHeight, ratio)
  else if (quarterTurn && containerWidth > 0 && containerHeight > 0) displayed = {width: containerWidth, height: containerHeight}

  if (displayed) {
    const box = quarterTurn ? {width: displayed.height, height: displayed.width} : displayed
    style.flex = 'none'
    style.alignSelf = 'center'
    style.width = `${box.width}px`
    style.height = `${box.height}px`
  }
  return style
}
