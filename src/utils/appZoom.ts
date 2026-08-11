export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 3

export const ZOOM_STEPS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1,
  1.1, 1.25, 1.5, 1.75, 2, 2.5, 3,
] as const

export function parseZoom(value: unknown): number {
  const parsed = Number.parseFloat(String(value))
  if (!Number.isFinite(parsed)) return 1
  return clampZoom(parsed)
}

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

export function snapZoom(value: number): number {
  return Math.round(clampZoom(value) * 20) / 20
}

export function formatZoomPercent(value: unknown): string {
  return `${Math.round(parseZoom(value) * 100)}%`
}

export function getNextZoom(current: unknown, direction: number): number {
  const normalized = parseZoom(current)
  let index = ZOOM_STEPS.findIndex((step) => step >= normalized - 0.001)

  if (index === -1) index = ZOOM_STEPS.length - 1
  else if (ZOOM_STEPS[index] - normalized > 0.001) index = Math.max(index - 1, 0)

  if (direction > 0) {
    return ZOOM_STEPS[Math.min(index + 1, ZOOM_STEPS.length - 1)]
  }

  return ZOOM_STEPS[Math.max(index - 1, 0)]
}

/**
 * Apply CSS zoom for non-Electron browsers.
 * Only shrink width (not height) so vertical flex / aspect-ratio thumbs stay intact.
 */
export function applyAppZoomStyles(
  style: { zoom: string; width: string; height: string },
  factor: number,
): number {
  const clamped = snapZoom(factor)
  if (clamped === 1) {
    style.zoom = ''
    style.width = ''
    style.height = ''
  } else {
    style.zoom = String(clamped)
    style.width = `${100 / clamped}%`
    style.height = ''
  }
  return clamped
}
