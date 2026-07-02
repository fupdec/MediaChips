export const TIMELINE_FRAME_PERCENTS = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95] as const

export type TimelineFramePercent = typeof TIMELINE_FRAME_PERCENTS[number]

export function pickTimelineFramePercent(hoverPercent: number): TimelineFramePercent {
  const clamped = Math.max(0, Math.min(100, hoverPercent))
  let nearest: TimelineFramePercent = TIMELINE_FRAME_PERCENTS[0]
  let minDistance = Math.abs(clamped - nearest)

  for (const percent of TIMELINE_FRAME_PERCENTS) {
    const distance = Math.abs(clamped - percent)
    if (distance < minDistance) {
      minDistance = distance
      nearest = percent
    }
  }

  return nearest
}

export function getPlayerPreviewAspectRatio(
  playlist: Array<{ width?: number | null; height?: number | null } | undefined>,
  nowPlaying: number,
): number {
  const item = playlist[nowPlaying]
  return (item?.width ?? 0) / (item?.height ?? 1) || 16 / 9
}

export interface PreviewTimelineMetrics {
  bottomPx: number
  leftPx: number
  widthPx: number
}

export interface RectLike {
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export function computePreviewTimelineMetrics(
  anchorRect: RectLike,
  timelineRect: RectLike,
  gap = 50,
  minBottom = 72,
): PreviewTimelineMetrics | null {
  if (!timelineRect.width || !timelineRect.height) {
    return null
  }

  return {
    bottomPx: Math.max(minBottom, Math.round(anchorRect.bottom - timelineRect.bottom + gap)),
    leftPx: timelineRect.left - anchorRect.left,
    widthPx: timelineRect.width,
  }
}

export function computePreviewHoverLeftPx(
  metrics: PreviewTimelineMetrics,
  hoverPercent: number,
): number {
  return metrics.leftPx + (metrics.widthPx * hoverPercent / 100)
}

export function computeTimelineHoverPercent(
  clientX: number,
  timelineRect: RectLike,
): number | null {
  if (!timelineRect.width) return null
  const left = clientX - timelineRect.left
  return (left / timelineRect.width) * 100
}
