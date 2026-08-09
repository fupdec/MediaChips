import findIndex from 'lodash/findIndex'
import {
  LIVE_STREAM_CHUNK_HANDOFF_SECONDS,
  LIVE_STREAM_CHUNK_SECONDS,
} from '@/utils/liveStreamChunk'
import {gridTileSeekSeconds} from '@shared/videoPreview'
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

/** Prefer browser-native decode; live re-encode only after stall / hard require. */
export function shouldPreferDirectPlayback(input: {
  transcodeRequired: boolean
  forceDirectPlayback: boolean
  liveTranscodeDisabled: boolean
  reason?: string | null
  needsRemux?: boolean
  /** Kept for callers; layout no longer skips direct when transcode is on. */
  transcodeEnabled?: boolean
}): boolean {
  if (input.forceDirectPlayback || input.liveTranscodeDisabled) return true
  // Pathological MP4 layout stays on file bytes first; stall watch falls back.
  if (input.reason === 'container_layout' || input.needsRemux === true) return true
  return !input.transcodeRequired
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
  reason?: string | null
  needsRemux?: boolean
}): boolean {
  if (!input.transcodeUnsupportedFormatsEnabled) {
    return input.playableMode === 'stream'
  }
  const layoutMayNeedFallback = input.reason === 'container_layout' || input.needsRemux === true
  return Boolean(input.transcodeRequired)
    || input.playableMode === 'stream'
    || layoutMayNeedFallback
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

/** Arm stall watch only while still on direct decode and before any fallback. */
export function shouldArmDirectSeekStallWatch(input: {
  usesLiveTranscode: boolean
  fallbackAttempted: boolean
}): boolean {
  return !input.usesLiveTranscode && !input.fallbackAttempted
}

/** Still seeking / not HAVE_FUTURE_DATA on direct path → force remux fallback. */
export function shouldTriggerDirectSeekStallFallback(input: {
  active: boolean
  usesLiveTranscode: boolean
  hasSrc: boolean
  seeking: boolean
  readyState: number
}): boolean {
  if (!input.active || input.usesLiveTranscode || !input.hasSrc) return false
  return input.seeking || input.readyState < 3
}

export type DirectPlaybackFallbackBegin =
  | {kind: 'busy'}
  | {kind: 'blocked'}
  | {kind: 'ok'}

/** Pre-check before shouldAttemptDirectPlaybackFallback / mediaId wiring. */
export function resolveDirectPlaybackFallbackBegin(input: {
  inFlight: boolean
  liveTranscodeDisabled: boolean
  forceDirectPlayback: boolean
}): DirectPlaybackFallbackBegin {
  if (input.inFlight) return {kind: 'busy'}
  if (input.liveTranscodeDisabled || input.forceDirectPlayback) return {kind: 'blocked'}
  return {kind: 'ok'}
}

export function resolveFallbackResumeStreamStart(
  playerCurrentTime: number,
  storeCurrentTime: number,
): number {
  const resumeTime = Number.isFinite(playerCurrentTime) && playerCurrentTime > 0
    ? playerCurrentTime
    : storeCurrentTime || 0
  return Math.max(0, Number(resumeTime) || 0)
}

export function resolveCurrentPlaybackMediaId(input: {
  currentLiveMediaId: number | null
  liveTranscodeMediaId?: number | null
  mediaId?: number | null
  playlistItemId?: number | null
}): number | null {
  return input.currentLiveMediaId
    ?? input.liveTranscodeMediaId
    ?? input.mediaId
    ?? input.playlistItemId
    ?? null
}

export function resolveLiveStreamUrlOptions(input: {
  copyCompatible: boolean
  accurateSeek: boolean
}): {copyCompatible?: true; accurateSeek?: true} {
  return {
    ...(input.copyCompatible ? {copyCompatible: true as const} : {}),
    ...(input.accurateSeek ? {accurateSeek: true as const} : {}),
  }
}

/** Free-tier playlist depth: indices above this require registration. */
export const UNREGISTERED_PLAYLIST_MAX_INDEX = 14

export type VideoSourcePlan =
  | {kind: 'unsupported'}
  | {
      kind: 'direct'
      streamMode: 'direct' | 'auto'
      /** When transcode is required but we still force direct, lock that choice. */
      lockForcedDirect: boolean
      liveTranscodeOfferable: boolean
    }
  | {
      kind: 'live'
      streamStart: number
      copyCompatible: boolean
      liveTranscodeOfferable: true
    }

/** Pure plan for unsupported / direct / live after playable-info fetch. */
export function resolveVideoSourcePlan(input: {
  playableMode: string
  transcodeRequired: boolean
  remuxCopy?: boolean
  reason?: string | null
  needsRemux?: boolean
  startTime: number
  forceDirectPlayback: boolean
  liveTranscodeDisabled: boolean
  transcodeUnsupportedFormatsEnabled: boolean
}): VideoSourcePlan {
  if (input.playableMode === 'unsupported') return {kind: 'unsupported'}

  const streamStart = Math.max(0, Number(input.startTime) || 0)
  const liveTranscodeOfferable = resolveLiveTranscodeOfferable({
    transcodeRequired: Boolean(input.transcodeRequired),
    transcodeUnsupportedFormatsEnabled: input.transcodeUnsupportedFormatsEnabled,
    playableMode: input.playableMode,
    reason: input.reason,
    needsRemux: input.needsRemux,
  })

  if (shouldPreferDirectPlayback({
    // Do not treat layout as "required" — try native first, offer fallback.
    transcodeRequired: Boolean(input.transcodeRequired),
    forceDirectPlayback: input.forceDirectPlayback,
    liveTranscodeDisabled: input.liveTranscodeDisabled,
    reason: input.reason,
    needsRemux: input.needsRemux,
    transcodeEnabled: input.transcodeUnsupportedFormatsEnabled,
  })) {
    const lockForcedDirect = Boolean(input.transcodeRequired)
      && (input.forceDirectPlayback || input.liveTranscodeDisabled)
    return {
      kind: 'direct',
      streamMode: lockForcedDirect ? 'direct' : 'auto',
      lockForcedDirect,
      liveTranscodeOfferable,
    }
  }

  return {
    kind: 'live',
    streamStart,
    copyCompatible: resolveLiveStreamCopyCompatible({
      remuxCopy: input.remuxCopy,
      reason: input.reason,
      streamStart,
    }),
    liveTranscodeOfferable: true,
  }
}

/** Normalize optional loadSrc start_time. */
export function parseExplicitPlaybackStart(startTime: unknown): number | undefined {
  if (startTime == null) return undefined
  const value = Number(startTime)
  return Number.isFinite(value) ? value : undefined
}

/**
 * Semantic/mix scene seek: prefer recomputing from CLIP tile + real duration,
 * and never land past EOF (stale DB duration / last-tile overshoot).
 */
export function resolveSemanticPlaybackStart(input: {
  explicitStart?: number
  segmentStart?: number | null
  semanticTileIndex?: number | null
  durationSec?: number | null
}): number | undefined {
  const duration = Number(input.durationSec)
  const hasDuration = Number.isFinite(duration) && duration > 0
  const tile = Number(input.semanticTileIndex)
  if (hasDuration && Number.isFinite(tile) && tile >= 0) {
    const fromTile = gridTileSeekSeconds(duration, tile)
    if (fromTile != null) return fromTile
  }
  const raw = input.explicitStart != null
    ? Number(input.explicitStart)
    : (input.segmentStart != null ? Number(input.segmentStart) : Number.NaN)
  if (!Number.isFinite(raw) || raw < 0) return undefined
  if (!hasDuration) return raw
  return Math.min(raw, Math.max(0, duration - 0.05))
}

/** Whether the direct-playback loadSrc path should seek after setting src. */
export function shouldSeekDirectOnLoadSrc(input: {
  explicitStart?: number
  targetStartTime: number
  segmentStart?: number | null
}): boolean {
  return input.explicitStart != null
    || input.targetStartTime > 0
    || input.segmentStart != null
}

/** Free-tier gate: unregistered users cannot play deep playlist indices. */
export function shouldBlockUnregisteredPlaylistDepth(input: {
  registered: boolean
  nowPlaying: number
  maxIndex?: number
}): boolean {
  if (input.registered) return false
  return input.nowPlaying > (input.maxIndex ?? UNREGISTERED_PLAYLIST_MAX_INDEX)
}

/** Pick duration on loadedmetadata (never trust live chunk element duration). */
export function resolveDurationOnLoadedMetadata(input: {
  usesLiveTranscode: boolean
  metadataDuration: number | null
  elementDuration: number
}): number | null {
  if (input.usesLiveTranscode) {
    return input.metadataDuration != null && input.metadataDuration > 0
      ? input.metadataDuration
      : null
  }
  if (Number.isFinite(input.elementDuration) && input.elementDuration > 0) {
    return input.elementDuration
  }
  return input.metadataDuration != null && input.metadataDuration > 0
    ? input.metadataDuration
    : null
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
