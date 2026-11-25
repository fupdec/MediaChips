export interface HoleRect {
  x: number
  y: number
  w: number
  h: number
  /** Corner radius in CSS px; 0 or missing keeps square corners. */
  r?: number
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
  const r = Math.min(Math.round(rect.r ?? 0), Math.floor(w / 2), Math.floor(h / 2))
  const hole = r > 0
    ? `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
    : `M${x} ${y}H${x + w}V${y + h}H${x}Z`
  return `path(evenodd, 'M0 0H${width}V${height}H0Z ${hole}')`
}
