export interface HoleRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * CSS `clip-path` value that keeps a whole viewport-sized element except one rectangle.
 * Native mpv draws below the web layer, so everything painted above the video (app UI, dialog
 * scrim) has to be cut out exactly where the picture is. Returns "none" for an empty rectangle.
 */
export function nativeVideoHolePath(viewport: {width: number; height: number}, rect: HoleRect): string {
  const x = Math.round(rect.x)
  const y = Math.round(rect.y)
  const w = Math.round(rect.w)
  const h = Math.round(rect.h)
  if (w <= 0 || h <= 0) return 'none'
  const width = Math.round(viewport.width)
  const height = Math.round(viewport.height)
  return `path(evenodd, 'M0 0H${width}V${height}H0Z M${x} ${y}H${x + w}V${y + h}H${x}Z')`
}
