import {gridTileSeekSeconds, VIDEO_GRID_SPRITE} from '@shared/videoPreview'

export const REVIEW_TILE_CLIP_SECONDS = 10

export type ReviewTileClipWindow = {
  start: number
  end: number
}

/**
 * Fixed ~clipSec playback window starting at the grid tile mid-slice seek.
 * Clamps at EOF and shifts start back when the remaining tail is too short.
 */
export function reviewTileClipWindow(
  durationSec: number,
  tileIndex: number,
  clipSec = REVIEW_TILE_CLIP_SECONDS,
  tileCount = VIDEO_GRID_SPRITE.cols * VIDEO_GRID_SPRITE.rows,
): ReviewTileClipWindow | null {
  const duration = Number(durationSec)
  const clip = Number(clipSec)
  if (!Number.isFinite(duration) || duration <= 0) return null
  if (!Number.isFinite(clip) || clip <= 0) return null

  const seek = gridTileSeekSeconds(duration, tileIndex, tileCount)
  if (seek == null) return null

  let start = seek
  let end = Math.min(duration, start + clip)
  const minWindow = Math.min(clip, duration) * 0.5
  if (end - start < minWindow) {
    start = Math.max(0, end - clip)
  }
  if (end <= start) {
    end = Math.min(duration, start + Math.min(clip, Math.max(0.25, duration - start)))
  }
  if (end <= start) return null
  return {start, end}
}

export function formatReviewDuration(seconds: number | null | undefined): string {
  const total = Math.floor(Number(seconds) || 0)
  if (!Number.isFinite(total) || total < 0) return '0:00'
  const hrs = Math.floor(total / 3600)
  const mins = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${mins}:${String(secs).padStart(2, '0')}`
}
