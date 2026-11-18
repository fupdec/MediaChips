/**
 * Keeps a horizontally centred popover (left: 50%; translateX(-50%)) inside
 * the player bounds by writing a pixel shift into `--edge-shift`.
 */
export const PLAYER_EDGE_PADDING = 8

export function computeEdgeShift(
  anchorCenter: number,
  width: number,
  boundsLeft: number,
  boundsRight: number,
  padding = PLAYER_EDGE_PADDING,
): number {
  const minLeft = boundsLeft + padding
  const maxRight = boundsRight - padding
  const left = anchorCenter - width / 2
  if (width >= maxRight - minLeft) return minLeft - left
  if (left < minLeft) return minLeft - left
  if (left + width > maxRight) return maxRight - (left + width)
  return 0
}

export function resolvePlayerBounds(el: Element): DOMRect {
  const container = el.closest('.player-main') ?? el.closest('.player')
  if (container) return container.getBoundingClientRect()
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight)
}

/** Measures `el` (layout size, ignoring transforms) and applies `--edge-shift`. */
export function applyPlayerEdgeShift(el: HTMLElement | null | undefined): void {
  if (!el) return
  const parent = el.offsetParent as HTMLElement | null
  if (!parent) return
  const parentRect = parent.getBoundingClientRect()
  const width = el.offsetWidth
  const anchorCenter = parentRect.left + el.offsetLeft
  const bounds = resolvePlayerBounds(el)
  const shift = computeEdgeShift(anchorCenter, width, bounds.left, bounds.right)
  el.style.setProperty('--edge-shift', `${Math.round(shift)}px`)
}
