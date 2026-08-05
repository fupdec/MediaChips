import findIndex from 'lodash/findIndex'
import { LIVE_STREAM_CHUNK_SECONDS } from '@/utils/liveStreamChunk'
import type { MediaItem } from '@/types/stores'
import type { ResolvedPlayableVideo } from '@/types/player'

export function metadataNumber(metadata: Record<string, unknown>, key: string): number | null {
  const value = Number(metadata[key])
  return Number.isFinite(value) ? value : null
}

/** Relative time inside a live chunk for an absolute timeline position. */
export function getLiveChunkRelativeTime(absoluteTime: number, chunkStart: number): number {
  const relative = Number(absoluteTime) - Number(chunkStart)
  if (!Number.isFinite(relative) || relative <= 0) return 0
  return relative
}

/**
 * How far the current live segment actually played.
 * Prefer currentTime over duration — fMP4 often reports a full -t window even
 * when the last frames were never delivered.
 */
export function resolveLiveHandoffElapsedFromTimes(
  currentTime: number,
  duration: number,
  fallback = LIVE_STREAM_CHUNK_SECONDS,
): number {
  if (Number.isFinite(currentTime) && currentTime > 0.05) return currentTime
  if (Number.isFinite(duration) && duration > 0.05) return duration
  return fallback
}

export function resolveLiveHandoffElapsed(videoEl: HTMLVideoElement | null | undefined): number {
  return resolveLiveHandoffElapsedFromTimes(
    Number(videoEl?.currentTime),
    Number(videoEl?.duration),
  )
}

/**
 * Relative seek target inside a live chunk, or null when the element should
 * stay put (missing element / already close enough / at chunk start).
 */
export function resolveLiveChunkRelativeSeekTarget(
  videoCurrentTime: number,
  absoluteTime: number,
  chunkStart: number,
): number | null {
  const relative = getLiveChunkRelativeTime(absoluteTime, chunkStart)
  if (relative <= 0.05) return null
  if (Math.abs((Number(videoCurrentTime) || 0) - relative) <= 0.12) return null
  return relative
}

export function isLoadSrcSessionStale(
  session: number,
  currentSession: number,
  isActive: boolean,
): boolean {
  return session !== currentSession || !isActive
}

export function normalizeTranscodeMaxHeight(value: unknown): string {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return '0'
  return String(num)
}

export function playbackErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message || fallback
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return fallback
}

/** Prefer browser-native decode when live re-encode is not forced. */
export function shouldPreferDirectPlayback(input: {
  transcodeRequired: boolean
  forceDirectPlayback: boolean
  liveTranscodeDisabled: boolean
}): boolean {
  return !input.transcodeRequired
    || input.forceDirectPlayback
    || input.liveTranscodeDisabled
}

/**
 * Remux-copy is only safe near t=0 and never for container_layout (Chromium paints black).
 */
export function resolveLiveStreamCopyCompatible(input: {
  remuxCopy?: boolean
  reason?: string | null
  streamStart: number
}): boolean {
  return input.remuxCopy === true
    && input.reason !== 'container_layout'
    && input.streamStart < 0.05
}

/** Whether timeupdate should fire segment-end playlist advance. */
export function shouldAdvanceAtSegmentEnd(input: {
  segmentAdvancePending: boolean
  active: boolean
  hasControls: boolean
  isLiveStreamSeeking: boolean
  isAdvancingChunk: boolean
  segmentEnd: number | null | undefined
  currentTime: number
}): boolean {
  if (
    input.segmentAdvancePending
    || !input.active
    || !input.hasControls
    || input.isLiveStreamSeeking
    || input.isAdvancingChunk
  ) {
    return false
  }
  if (input.segmentEnd == null) return false
  if (!Number.isFinite(input.currentTime) || input.currentTime < input.segmentEnd) return false
  return true
}

function matchesInitialPlayable(item: MediaItem, initialVideo: MediaItem): boolean {
  if (initialVideo.key && item.key) return item.key === initialVideo.key
  if (initialVideo.markId != null && item.markId != null) {
    return Number(item.markId) === Number(initialVideo.markId)
  }
  return item.id == initialVideo.id
}

export async function resolvePlayableVideo(
  playlist: MediaItem[],
  initialVideo: MediaItem,
  checkFileExistsFn: (filePath: string) => Promise<boolean>,
): Promise<ResolvedPlayableVideo | null> {
  const candidates: Array<{video: MediaItem; index: number}> = []

  if (playlist.length > 0) {
    const foundIndex = findIndex(playlist, (item) => matchesInitialPlayable(item, initialVideo))

    if (foundIndex >= 0) {
      for (let offset = 0; offset < playlist.length; offset++) {
        const index = (foundIndex + offset) % playlist.length
        candidates.push({video: playlist[index], index})
      }
    } else if (initialVideo?.path || initialVideo?.id) {
      candidates.push({video: initialVideo, index: 0})
    }
  } else if (initialVideo?.path) {
    candidates.push({video: initialVideo, index: 0})
  }

  for (const {video: candidate, index} of candidates) {
    if (!candidate?.path) continue

    if (await checkFileExistsFn(candidate.path)) {
      return {video: candidate, index}
    }
  }

  if (initialVideo?.id) {
    const index = playlist.length > 0
      ? Math.max(0, findIndex(playlist, (item) => matchesInitialPlayable(item, initialVideo)))
      : 0
    return {video: initialVideo, index}
  }

  return null
}
