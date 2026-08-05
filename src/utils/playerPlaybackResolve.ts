import findIndex from 'lodash/findIndex'
import {
  LIVE_STREAM_CHUNK_HANDOFF_SECONDS,
  LIVE_STREAM_CHUNK_SECONDS,
} from '@/utils/liveStreamChunk'
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

/** Prefer measured segment duration; fall back to the fixed live chunk window. */
export function resolveLiveChunkEndMark(
  segmentDuration: number,
  fallback = LIVE_STREAM_CHUNK_SECONDS,
): number {
  return Number.isFinite(segmentDuration) && segmentDuration > 0.5
    ? segmentDuration
    : fallback
}

/** Whether the live pipe is close enough to EOF to hand off the next chunk. */
export function shouldHandOffLiveStreamChunk(input: {
  usesLiveTranscode: boolean
  hasPlayer: boolean
  active: boolean
  isAdvancingChunk: boolean
  isLiveStreamSeeking: boolean
  paused: boolean
  relativeTime: number
  endMark: number
  handoffSeconds?: number
}): boolean {
  if (
    !input.usesLiveTranscode
    || !input.hasPlayer
    || !input.active
    || input.isAdvancingChunk
    || input.isLiveStreamSeeking
    || input.paused
  ) {
    return false
  }
  const handoff = input.handoffSeconds ?? LIVE_STREAM_CHUNK_HANDOFF_SECONDS
  return input.relativeTime >= input.endMark - handoff
}

export type LiveSeekStrategy =
  | {kind: 'noop-at-stream-start'}
  | {kind: 'relative-in-buffer'}
  | {kind: 'restart-stream'}

/** Choose how a live timeline seek should be applied to the current ffmpeg pipe. */
export function resolveLiveSeekStrategy(input: {
  seekTime: number
  streamStart: number
  relative: number
  bufferedEnd: number
  hasSrc: boolean
  isAdvancingChunk: boolean
}): LiveSeekStrategy {
  if (
    Math.abs(input.seekTime - input.streamStart) <= 0.05
    && input.hasSrc
    && !input.isAdvancingChunk
  ) {
    return {kind: 'noop-at-stream-start'}
  }

  if (
    input.relative > 0.05
    && input.relative <= input.bufferedEnd + 0.25
    && input.hasSrc
    && !input.isAdvancingChunk
  ) {
    return {kind: 'relative-in-buffer'}
  }

  return {kind: 'restart-stream'}
}

/** Clip start / explicit seek / restore playback time for loadSrc. */
export function resolvePlaybackStartTime(input: {
  explicitStart?: number
  segmentStart?: number | null
  playingClip: boolean
  restorePlaybackTime: boolean
  metaTime: number | null
  metadataDuration: number | null
}): number {
  if (input.explicitStart != null) return input.explicitStart
  if (input.segmentStart != null) return input.segmentStart
  if (
    !input.playingClip
    && input.restorePlaybackTime
    && input.metaTime != null
    && input.metadataDuration != null
    && !(input.metadataDuration - input.metaTime < 5)
  ) {
    return input.metaTime
  }
  return 0
}

export function resolveLiveTranscodeOfferable(input: {
  transcodeRequired: boolean
  transcodeUnsupportedFormatsEnabled: boolean
  playableMode?: string
}): boolean {
  const canLiveTranscode = input.transcodeRequired && input.transcodeUnsupportedFormatsEnabled
  return canLiveTranscode || input.playableMode === 'stream'
}

export function shouldSkipLiveQualityChange(input: {
  normalizedMaxHeight: string
  currentMaxHeight: string
  liveStreamCopyCompatible: boolean
}): boolean {
  return input.normalizedMaxHeight === input.currentMaxHeight
    && !input.liveStreamCopyCompatible
}

/**
 * After a live segment ends, continue mid-clip even when file duration is unknown.
 * Returns whether playlist autoplay should still be blocked.
 */
export function resolveEndedLiveNextStart(input: {
  continuousNextStart: number | null
  absoluteTime: number
  segmentEnd: number | null | undefined
}): {nextStart: number | null; stillInsideSegment: boolean} {
  const stillInsideSegment = input.segmentEnd != null
    && input.absoluteTime < input.segmentEnd - 0.25
  let nextStart = input.continuousNextStart
  if (nextStart == null && stillInsideSegment) {
    nextStart = input.absoluteTime
  }
  return {nextStart, stillInsideSegment}
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
