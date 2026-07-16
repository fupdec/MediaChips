import {nextTick} from 'vue'
import findIndex from 'lodash/findIndex'
import { debounce } from '@/utils/debounce'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {usePlayerStore} from '@/stores/player'
import {useSettingsStore} from '@/stores/settings'
import {useDialogsStore} from '@/stores/dialogs'
import {useRegistrationStore} from '@/stores/registration'
import {useItemsStore} from '@/stores/items'
import {useEventBus} from '@/utils/eventBus'
import {
  getDefaultMediaTypeId,
  findMediaTypeById,
  isAudioMediaType,
  isAudioFilePath,
} from '@/utils/mediaType'
import {buildApiUrl} from '@/services/apiClient'
import {typedApi} from '@/services/typedApi'
import {checkFileExists} from '@/services/fileService'
import {setNotification} from '@/services/notificationService'
import {ensureMarkThumb, getMarkImagePath} from '@/utils/markThumb'
import {isIgnorablePlaybackError, getAbsolutePlaybackTime} from '@/utils/playerBuffer'
import {
  getNextChunkStart,
  LIVE_STREAM_CHUNK_SECONDS,
  LIVE_STREAM_PREFETCH_SECONDS,
  resolveLiveFileDuration,
} from '@/utils/liveStreamChunk'
import {
  buildVideoStreamUrl,
  buildLiveStreamUrl,
  fetchPlayableInfo,
  stopLiveTranscode,
  playLiveStreamWhenReady,
  shouldAttemptDirectPlaybackFallback,
  UnsupportedPlaybackError,
} from '@/services/transcodeService'
import {
  markLiveTranscodeSession,
  clearLiveTranscodeSessionMark,
} from '@/utils/liveTranscodeLifecycle'
import type { MediaItem, PlayerPlaylistItem } from '@/types/stores'
import type { ResolvedPlayableVideo, UsePlayerPlaybackOptions } from '@/types/player'
import { getSegmentEnd, getSegmentStart, isClipPlaylistItem, mergeClipFields, playlistItemKey } from '@/utils/mediaItem'
import { isPlaylistNavDisabled } from '@/composable/usePlayerTransportPlayback'

function metadataNumber(metadata: Record<string, unknown>, key: string): number | null {
  const value = Number(metadata[key])
  return Number.isFinite(value) ? value : null
}

/** Relative time inside a live chunk for an absolute timeline position. */
export function getLiveChunkRelativeTime(absoluteTime: number, chunkStart: number): number {
  const relative = Number(absoluteTime) - Number(chunkStart)
  if (!Number.isFinite(relative) || relative <= 0) return 0
  return relative
}

function applyLiveChunkRelativeSeek(
  videoEl: HTMLVideoElement | null | undefined,
  absoluteTime: number,
  chunkStart: number,
) {
  if (!videoEl) return
  const relative = getLiveChunkRelativeTime(absoluteTime, chunkStart)
  if (relative <= 0.05) return
  if (Math.abs((videoEl.currentTime || 0) - relative) <= 0.12) return
  videoEl.currentTime = relative
}

function waitForMediaEvent(
  videoEl: HTMLVideoElement,
  eventName: 'loadedmetadata' | 'seeked',
  timeoutMs = 8000,
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      videoEl.removeEventListener(eventName, onEvent)
      window.clearTimeout(timeoutId)
      resolve()
    }
    const onEvent = () => finish()
    const timeoutId = window.setTimeout(finish, timeoutMs)
    videoEl.addEventListener(eventName, onEvent, {once: true})
  })
}

async function seekDirectPlaybackTo(
  videoEl: HTMLVideoElement,
  time: number,
  isCancelled?: () => boolean,
) {
  const target = Math.max(0, Number(time) || 0)
  if (!Number.isFinite(target)) return

  if (videoEl.readyState < HTMLMediaElement.HAVE_METADATA) {
    await waitForMediaEvent(videoEl, 'loadedmetadata')
    if (isCancelled?.()) return
  }

  if (Math.abs((videoEl.currentTime || 0) - target) <= 0.12) return
  videoEl.currentTime = target
  await waitForMediaEvent(videoEl, 'seeked', 4000)
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message || fallback
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return fallback
}

export function isLoadSrcSessionStale(
  session: number,
  currentSession: number,
  isActive: boolean,
): boolean {
  return session !== currentSession || !isActive
}

export async function resolvePlayableVideo(
  playlist: MediaItem[],
  initialVideo: MediaItem,
  checkFileExistsFn: (filePath: string) => Promise<boolean>,
): Promise<ResolvedPlayableVideo | null> {
  const candidates = []

  const matchesInitial = (item: MediaItem) => {
    if (initialVideo.key && item.key) return item.key === initialVideo.key
    if (initialVideo.markId != null && item.markId != null) {
      return Number(item.markId) === Number(initialVideo.markId)
    }
    return item.id == initialVideo.id
  }

  if (playlist.length > 0) {
    const foundIndex = findIndex(playlist, matchesInitial)

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
      ? Math.max(0, findIndex(playlist, matchesInitial))
      : 0
    return {video: initialVideo, index}
  }

  return null
}

function normalizeTranscodeMaxHeight(value: unknown): string {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return '0'
  return String(num)
}

export function usePlayerPlayback({
  isReady,
  videoPlayer,
  controls,
  marks,
  isPlayerWindow,
  updateItemVideo,
  updatePlayerWindowTitle,
}: UsePlayerPlaybackOptions) {
  const appStore = useAppStore()
  const playerStore = usePlayerStore()
  const settingsStore = useSettingsStore()
  const dialogsStore = useDialogsStore()
  const registrationStore = useRegistrationStore()
  const itemsStore = useItemsStore()
  const eventBus = useEventBus()
  const {t} = useI18n()

  let segmentAdvancePending = false

  const maybeAdvanceSegmentPlaylist = () => {
    if (segmentAdvancePending || !playerStore.active || !controls.value) return
    if (playerStore.isLiveStreamSeeking || isAdvancingChunk) return

    const current = playerStore.playlist[playerStore.nowPlaying]
    const segmentEnd = getSegmentEnd(current)
    if (segmentEnd == null) return

    const currentTime = Number(playerStore.currentTime)
    if (!Number.isFinite(currentTime) || currentTime < segmentEnd) return

    const stopAtSegmentEnd = () => {
      playerStore.playerPause()
      if (playerStore.player && !playerStore.usesLiveTranscode) {
        playerStore.player.currentTime = segmentEnd
      }
      playerStore.syncPlaybackState()
    }

    segmentAdvancePending = true
    try {
      // Cancel in-flight live chunk work so it cannot restart the previous media.
      seekLiveStream.cancel?.()
      maybeAdvanceLiveStreamChunk.cancel?.()
      liveStreamSeekGeneration += 1
      isAdvancingChunk = false
      pendingNextChunkStart = null

      const canAutoplayNext = playerStore.playlistMode.includes('autoplay')
        && !isPlaylistNavDisabled({
          playlistMode: playerStore.playlistMode,
          playlistShuffle: playerStore.playlistShuffle,
          nowPlaying: playerStore.nowPlaying,
          playlistLength: playerStore.playlist.length,
          direction: 'next',
        })

      if (canAutoplayNext) {
        controls.value.next?.()
      } else {
        stopAtSegmentEnd()
      }
    } finally {
      // Allow the next segment (or pause) to settle before watching again.
      window.setTimeout(() => {
        segmentAdvancePending = false
      }, 250)
    }
  }

  const getLiveFileDuration = () => resolveLiveFileDuration({
    metadataDuration: metadataNumber(playerStore.metadata, 'duration'),
    storeDuration: playerStore.duration,
    liveStreamOffset: playerStore.liveStreamOffset,
  })

  const initPlayer = () => {
    if (!playerStore.player) return
    if (playerStore.player.dataset.playerBound === '1') return

    playerStore.player.dataset.playerBound = '1'
    isReady.value = false

    playerStore.player.addEventListener('loadedmetadata', () => {
      const videoEl = playerStore.player
      if (!videoEl) return

      const metadataDuration = metadataNumber(playerStore.metadata, 'duration')
      if (playerStore.usesLiveTranscode) {
        // Never trust videoEl.duration for live chunks — it is the segment length.
        if (metadataDuration != null && metadataDuration > 0) {
          playerStore.duration = metadataDuration
        }
      } else if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
        playerStore.duration = videoEl.duration
      } else if (metadataDuration != null && metadataDuration > 0) {
        playerStore.duration = metadataDuration
      }

      playerStore.syncPlaybackState()
    })

    playerStore.player.addEventListener('timeupdate', () => {
      playerStore.syncPlaybackState()
      maybeAdvanceLiveStreamChunk()
      maybeAdvanceSegmentPlaylist()
    })

    playerStore.player.addEventListener('progress', () => {
      playerStore.syncPlaybackState()
    })

    playerStore.player.addEventListener('ended', async () => {
      if (playerStore.usesLiveTranscode) {
        const fileDuration = getLiveFileDuration()
        let nextStart = getNextChunkStart(
          playerStore.liveStreamOffset,
          fileDuration,
        )

        const current = playerStore.playlist[playerStore.nowPlaying]
        const segmentEnd = getSegmentEnd(current)
        const absoluteTime = getAbsolutePlaybackTime({
          usesLiveTranscode: true,
          liveStreamOffset: playerStore.liveStreamOffset,
          playerCurrentTime: playerStore.player?.currentTime,
        })
        const stillInsideSegment = segmentEnd != null && absoluteTime < segmentEnd - 0.25

        // Mid-clip: keep streaming the next chunk even if duration is unknown/wrong.
        if (nextStart == null && stillInsideSegment) {
          nextStart = playerStore.liveStreamOffset + LIVE_STREAM_CHUNK_SECONDS
        }

        if (nextStart != null) {
          const advanced = await switchLiveStreamChunk(nextStart)
          if (advanced) return
        }

        // Do not advance the playlist while the current timed clip is unfinished.
        if (stillInsideSegment) return
      }

      if (playerStore.playlistMode.includes('autoplay') && controls.value) {
        controls.value.next?.()
      }
    })

    playerStore.player.addEventListener('error', () => {
      void handleVideoElementError()
    })

    playerStore.player.addEventListener('seeking', () => {
      if (playerStore.usesLiveTranscode) return
      armDirectSeekStallWatch()
    })

    playerStore.player.addEventListener('seeked', () => {
      clearDirectSeekStallWatch()
    })

    playerStore.player.addEventListener('waiting', () => {
      if (!playerStore.usesLiveTranscode) {
        // Chromium often stalls mid-seek on pathological MP4s without firing error.
        armDirectSeekStallWatch(1500)
        return
      }
      playerStore.isStreamWaiting = true
    })

    playerStore.player.addEventListener('playing', () => {
      clearDirectSeekStallWatch()
      if (!playerStore.usesLiveTranscode) return
      playerStore.liveTranscodeStarted = true
      playerStore.isStreamWaiting = false
      playerStore.playbackError = false
      playerStore.isLiveStreamSeeking = false
    })
  }

  const handleVideoElementError = async () => {
    if (!playerStore.active || !playerStore.player?.src) return

    if (isIgnorablePlaybackError({
      usesLiveTranscode: playerStore.usesLiveTranscode,
      isLiveStreamSeeking: playerStore.isLiveStreamSeeking,
      mediaErrorCode: playerStore.player.error?.code,
    })) {
      return
    }

    if (await tryFallbackDirectToLiveTranscode(playerStore.player.error?.code)) {
      return
    }

    playerStore.playbackError = true
    if (playerStore.usesLiveTranscode) {
      failTranscode(playerStore.player.error?.message || 'Playback failed')
    }
  }

  const bindVideoElement = (el: HTMLVideoElement | null) => {
    if (!el) return

    if (playerStore.player && playerStore.player !== el) {
      delete playerStore.player.dataset.playerBound
    }

    playerStore.player = el
    initPlayer()
  }

  const ensureVideoElement = async () => {
    if (playerStore.player) return playerStore.player

    await nextTick()
    bindVideoElement(videoPlayer.value)
    return playerStore.player
  }

  const getMarks = async (media: MediaItem) => {
    try {
      const res = await typedApi.getMarksForVideo(media.id)
      playerStore.marks = res.data

      if (!media?.id || !appStore.mediaPath) return

      for (const mark of playerStore.marks) {
        if (mark.id == null) continue
        const imgPath = getMarkImagePath(appStore.mediaPath, mark.id)
        const exists = await checkFileExists(imgPath)
        if (exists) {
          eventBus.emit('updateMarkImage', mark.id)
          continue
        }

        try {
          await ensureMarkThumb({
            mark,
            videoPath: media.path,
            mediaPath: appStore.mediaPath,
            mediaId: media.id,
            onUpdated: (markId: number | string) => eventBus.emit('updateMarkImage', markId),
          })
        } catch (e) {
          console.error('Failed to create mark thumb:', e)
        }
      }

      eventBus.emit('refreshMarkThumbs')

      if (marks.value?.getThumbs) {
        await marks.value.getThumbs()
      }
    } catch (e) {
      console.error('Failed to load marks:', e)
    }
  }

  const getMetadata = async (media: MediaItem) => {
    const res = await typedApi.getVideoMetadata(media.id)
    playerStore.metadata = res.data
    playerStore.media = media
  }

  let transcodeSessionId = 0
  let currentLiveMediaId: number | null = null
  let liveStreamSeekGeneration = 0
  let isAdvancingChunk = false
  let pendingNextChunkStart: number | null = null
  let directPlaybackFallbackAttempted = false
  let liveStreamCopyCompatible = false
  let liveStreamAccurateSeek = false
  let directPlaybackFallbackInFlight = false
  let directSeekStallTimer: ReturnType<typeof setTimeout> | null = null

  const clearDirectSeekStallWatch = () => {
    if (directSeekStallTimer != null) {
      clearTimeout(directSeekStallTimer)
      directSeekStallTimer = null
    }
  }

  const armDirectSeekStallWatch = (delayMs = 2500) => {
    if (playerStore.usesLiveTranscode || directPlaybackFallbackAttempted) return
    clearDirectSeekStallWatch()
    directSeekStallTimer = setTimeout(() => {
      directSeekStallTimer = null
      if (!playerStore.active || playerStore.usesLiveTranscode) return
      const videoEl = playerStore.player
      if (!videoEl?.src) return
      // Still seeking/waiting with no error → force remux path.
      if (videoEl.seeking || videoEl.readyState < 3) {
        void tryFallbackDirectToLiveTranscode(3)
      }
    }, delayMs)
  }

  const resetTranscodeState = () => {
    playerStore.transcodeStatus = 'none'
    playerStore.transcodeError = null
  }

  const liveStreamUrlOptions = () => ({
    ...(liveStreamCopyCompatible ? {copyCompatible: true} : {}),
    ...(liveStreamAccurateSeek ? {accurateSeek: true} : {}),
  })

  const failTranscode = (message?: string) => {
    playerStore.transcodeStatus = 'error'
    playerStore.transcodeError = message || 'Live transcode failed'
    playerStore.playbackError = true
  }

  const playCurrentLiveStream = () => {
    const videoEl = playerStore.player
    const mediaId = currentLiveMediaId
    if (!videoEl || mediaId == null) {
      return Promise.resolve()
    }

    return playLiveStreamWhenReady(
      videoEl,
      () => buildLiveStreamUrl(
        buildApiUrl,
        mediaId,
        playerStore.liveStreamOffset,
        playerStore.liveTranscodeMaxHeight,
        liveStreamUrlOptions(),
      ),
      {isCancelled: () => !playerStore.active},
    )
  }

  const tryFallbackDirectToLiveTranscode = async (mediaErrorCode?: number) => {
    if (directPlaybackFallbackInFlight) return true

    const media = playerStore.media
      || playerStore.playlist[playerStore.nowPlaying]
      || null
    const mediaId = media?.id ?? currentLiveMediaId
    const transcodeEnabled = settingsStore.transcodeUnsupportedFormats === '1'

    if (!shouldAttemptDirectPlaybackFallback({
      usesLiveTranscode: playerStore.usesLiveTranscode,
      fallbackAttempted: directPlaybackFallbackAttempted,
      transcodeEnabled,
      mediaErrorCode,
    })) {
      return false
    }

    if (mediaId == null || !playerStore.player) return false

    directPlaybackFallbackAttempted = true
    directPlaybackFallbackInFlight = true

    const resumeTime = Number.isFinite(playerStore.player.currentTime) && playerStore.player.currentTime > 0
      ? playerStore.player.currentTime
      : playerStore.currentTime || 0
    const streamStart = Math.max(0, Number(resumeTime) || 0)

    try {
      currentLiveMediaId = mediaId
      // Prefer re-encode: stream-copy remux of odd H.264 MP4s often yields audio + black video.
      liveStreamCopyCompatible = false
      playerStore.usesLiveTranscode = true
      playerStore.liveTranscodeMediaId = mediaId
      playerStore.liveTranscodeMaxHeight = normalizeTranscodeMaxHeight(settingsStore.transcodeMaxHeight)
      playerStore.transcodeStatus = 'stream'
      playerStore.playbackError = false
      playerStore.transcodeError = null
      playerStore.liveStreamOffset = streamStart
      playerStore.currentTime = streamStart
      playerStore.bufferedRanges = []
      playerStore.isLiveStreamSeeking = true
      playerStore.liveStreamSeekHandler = (time: number) => {
        playerStore.currentTime = time
        seekLiveStream(time)
      }
      markLiveTranscodeSession(mediaId)

      playerStore.player.src = buildLiveStreamUrl(
        buildApiUrl,
        mediaId,
        streamStart,
        playerStore.liveTranscodeMaxHeight,
        liveStreamUrlOptions(),
      )

      await playCurrentLiveStream()
      if (!playerStore.active) return true
      playerStore.paused = false
      playerStore.currentTime = streamStart
      playerStore.isLiveStreamSeeking = false
      playerStore.syncPlaybackState()
      return true
    } catch (error) {
      console.warn('Direct playback re-encode fallback failed:', error)
      failTranscode(errorMessage(error, 'Playback failed after transcode fallback'))
      return true
    } finally {
      directPlaybackFallbackInFlight = false
    }
  }

  const stopLiveTranscodeSession = (mediaId: number | null = currentLiveMediaId) => {
    if (mediaId == null) return Promise.resolve()
    return stopLiveTranscode(mediaId).catch((error) => {
      console.warn('Failed to stop live transcode session:', error)
    })
  }

  const clearLiveTranscodeHandlers = async () => {
    const stoppingMediaId = currentLiveMediaId
    playerStore.usesLiveTranscode = false
    playerStore.liveTranscodeStarted = false
    playerStore.liveTranscodeMediaId = null
    playerStore.liveTranscodeMaxHeight = '1080'
    playerStore.liveStreamSeekHandler = null
    playerStore.liveStreamOffset = 0
    playerStore.bufferedRanges = []
    playerStore.isLiveStreamSeeking = false
    playerStore.isStreamWaiting = false
    currentLiveMediaId = null
    liveStreamCopyCompatible = false
    liveStreamAccurateSeek = false
    isAdvancingChunk = false
    pendingNextChunkStart = null
    liveStreamSeekGeneration += 1
    seekLiveStream.cancel?.()
    maybeAdvanceLiveStreamChunk.cancel?.()
    clearDirectSeekStallWatch()

    clearLiveTranscodeSessionMark()

    if (stoppingMediaId) {
      await stopLiveTranscodeSession(stoppingMediaId)
    }
  }

  const switchLiveStreamChunk = async (nextChunkStart: number) => {
    if (!currentLiveMediaId || !playerStore.player || !playerStore.active || nextChunkStart == null) {
      return false
    }

    const seekGeneration = ++liveStreamSeekGeneration
    isAdvancingChunk = true
    pendingNextChunkStart = null
    // Chunk boundaries do not need frame-accurate decode-from-zero seeking.
    liveStreamAccurateSeek = false
    const wasPaused = playerStore.paused

    playerStore.isLiveStreamSeeking = true
    playerStore.playbackError = false
    playerStore.liveStreamOffset = nextChunkStart
    playerStore.bufferedRanges = []
    playerStore.player.src = buildLiveStreamUrl(
      buildApiUrl,
      currentLiveMediaId,
      nextChunkStart,
      playerStore.liveTranscodeMaxHeight,
      liveStreamUrlOptions(),
    )
    playerStore.currentTime = nextChunkStart

    try {
      if (!wasPaused) {
        await playCurrentLiveStream()
        playerStore.paused = false
      }
    } catch (error) {
      if (seekGeneration === liveStreamSeekGeneration && !isIgnorablePlaybackError({
        usesLiveTranscode: true,
        isLiveStreamSeeking: true,
        mediaErrorCode: playerStore.player.error?.code,
      })) {
        console.log(error)
      }
    } finally {
      if (seekGeneration === liveStreamSeekGeneration) {
        isAdvancingChunk = false
        playerStore.isLiveStreamSeeking = false
        playerStore.syncPlaybackState()
      }
    }

    return seekGeneration === liveStreamSeekGeneration
  }

  const maybeAdvanceLiveStreamChunk = debounce(async () => {
    if (!playerStore.usesLiveTranscode || !playerStore.player || !playerStore.active || isAdvancingChunk) {
      return
    }
    if (playerStore.isLiveStreamSeeking || playerStore.paused) return

    const chunkStart = playerStore.liveStreamOffset
    const relativeTime = playerStore.player.currentTime || 0
    const nextStart = getNextChunkStart(chunkStart, getLiveFileDuration())
    if (nextStart == null) return

    const prefetchAt = LIVE_STREAM_CHUNK_SECONDS - LIVE_STREAM_PREFETCH_SECONDS
    if (relativeTime < prefetchAt) return
    if (pendingNextChunkStart === nextStart) return

    pendingNextChunkStart = nextStart
    await switchLiveStreamChunk(nextStart)
  }, 200)

  const seekLiveStream = debounce(async (time: number) => {
    if (!currentLiveMediaId || !playerStore.player || !playerStore.active || !playerStore.usesLiveTranscode) {
      return
    }

    const seekTime = Math.max(0, Number(time) || 0)
    const streamStart = playerStore.liveStreamOffset
    const relative = getLiveChunkRelativeTime(seekTime, streamStart)

    // Already on a stream that starts at this exact position.
    if (
      Math.abs(seekTime - streamStart) <= 0.05
      && playerStore.player.src
      && !isAdvancingChunk
    ) {
      playerStore.currentTime = seekTime
      playerStore.syncPlaybackState()
      return
    }

    // Small forward seek inside the current non-seekable segment only works once
    // that time is already buffered; otherwise restart ffmpeg at the exact time.
    const bufferedEnd = playerStore.player.buffered?.length
      ? playerStore.player.buffered.end(playerStore.player.buffered.length - 1)
      : 0
    if (
      relative > 0.05
      && relative < LIVE_STREAM_CHUNK_SECONDS
      && relative <= bufferedEnd + 0.25
      && playerStore.player.src
      && !isAdvancingChunk
    ) {
      applyLiveChunkRelativeSeek(playerStore.player, seekTime, streamStart)
      playerStore.currentTime = seekTime
      playerStore.syncPlaybackState()
      return
    }

    const seekGeneration = ++liveStreamSeekGeneration
    const wasPaused = playerStore.paused
    isAdvancingChunk = false
    pendingNextChunkStart = null
    // Keep seeks fast — never request decode-from-zero / keyframe-probe accurate mode.
    liveStreamAccurateSeek = false
    playerStore.isLiveStreamSeeking = true
    playerStore.playbackError = false
    playerStore.liveStreamOffset = seekTime
    playerStore.bufferedRanges = []
    playerStore.player.src = buildLiveStreamUrl(
      buildApiUrl,
      currentLiveMediaId,
      seekTime,
      playerStore.liveTranscodeMaxHeight,
      liveStreamUrlOptions(),
    )
    playerStore.currentTime = seekTime

    const onPlaying = () => {
      if (seekGeneration !== liveStreamSeekGeneration) return
      playerStore.isLiveStreamSeeking = false
      playerStore.playbackError = false
      playerStore.syncPlaybackState()
    }

    playerStore.player.addEventListener('playing', onPlaying, {once: true})

    if (!wasPaused) {
      try {
        await playCurrentLiveStream()
        playerStore.paused = false
      } catch (error) {
        if (seekGeneration !== liveStreamSeekGeneration) return
        if (isIgnorablePlaybackError({
          usesLiveTranscode: true,
          isLiveStreamSeeking: true,
          mediaErrorCode: playerStore.player.error?.code,
        })) {
          return
        }
        console.log(error)
      }
    }

    if (seekGeneration !== liveStreamSeekGeneration) return

    playerStore.currentTime = seekTime
    playerStore.syncPlaybackState()

    window.setTimeout(() => {
      if (seekGeneration !== liveStreamSeekGeneration) return
      if (!playerStore.isLiveStreamSeeking) return
      playerStore.isLiveStreamSeeking = false
    }, 15000)
  }, 250)

  const resolveVideoSource = async (
    mediaId: number,
    startTime = 0,
    _options: {accurateStart?: boolean} = {},
  ) => {
    await clearLiveTranscodeHandlers()

    const playable = await fetchPlayableInfo(mediaId)

    if (playable.mode === 'unsupported') {
      throw new UnsupportedPlaybackError()
    }

    const streamStart = Math.max(0, Number(startTime) || 0)

    // Prefer direct playback whenever the browser can handle the file.
    // Forcing live re-encode just for clip marks made every clip start wait on ffmpeg.
    if (!playable.transcodeRequired) {
      resetTranscodeState()
      liveStreamAccurateSeek = false
      return buildVideoStreamUrl(buildApiUrl, mediaId, 'auto')
    }

    currentLiveMediaId = mediaId
    // container_layout needs full re-encode; remux-copy paints black video in Chromium.
    liveStreamCopyCompatible = playable.remuxCopy === true
      && playable.reason !== 'container_layout'
      && streamStart < 0.05
    liveStreamAccurateSeek = false
    playerStore.usesLiveTranscode = true
    playerStore.liveTranscodeMediaId = mediaId
    playerStore.liveTranscodeMaxHeight = normalizeTranscodeMaxHeight(settingsStore.transcodeMaxHeight)
    playerStore.transcodeStatus = 'stream'
    playerStore.liveStreamSeekHandler = (time: number) => {
      playerStore.currentTime = time
      seekLiveStream(time)
    }

    playerStore.liveStreamOffset = streamStart
    resetTranscodeState()
    playerStore.transcodeStatus = 'stream'
    markLiveTranscodeSession(mediaId)
    return buildLiveStreamUrl(
      buildApiUrl,
      mediaId,
      streamStart,
      playerStore.liveTranscodeMaxHeight,
      liveStreamUrlOptions(),
    )
  }

  const isLoadSrcStale = (session: number) =>
    isLoadSrcSessionStale(session, transcodeSessionId, playerStore.active)

  const changeLiveTranscodeMaxHeight = async (maxHeight: number | string) => {
    const normalized = String(maxHeight)
    if (!playerStore.usesLiveTranscode || !playerStore.player || !currentLiveMediaId || !playerStore.active) {
      return
    }
    if (normalized === playerStore.liveTranscodeMaxHeight && !liveStreamCopyCompatible) return

    seekLiveStream.cancel?.()
    maybeAdvanceLiveStreamChunk.cancel?.()

    const seekGeneration = ++liveStreamSeekGeneration
    isAdvancingChunk = false
    pendingNextChunkStart = null
    const time = Math.max(0, Number(playerStore.currentTime) || 0)
    const wasPaused = playerStore.paused

    const liveMediaId = currentLiveMediaId
    if (liveMediaId == null) return

    // Quality changes require re-encode; drop remux-copy mode.
    liveStreamCopyCompatible = false
    playerStore.liveTranscodeMaxHeight = normalized
    playerStore.isLiveStreamSeeking = true
    playerStore.playbackError = false
    playerStore.liveStreamOffset = time
    playerStore.bufferedRanges = []
    playerStore.currentTime = time
    playerStore.player.src = buildLiveStreamUrl(
      buildApiUrl,
      liveMediaId,
      time,
      normalized,
      liveStreamUrlOptions(),
    )

    try {
      if (!wasPaused) {
        await playLiveStreamWhenReady(
          playerStore.player!,
          () => buildLiveStreamUrl(
            buildApiUrl,
            liveMediaId,
            time,
            normalized,
            liveStreamUrlOptions(),
          ),
          {isCancelled: () => !playerStore.active},
        )
        if (seekGeneration !== liveStreamSeekGeneration || !playerStore.active) return
        playerStore.paused = false
      }
    } catch (error) {
      if (seekGeneration !== liveStreamSeekGeneration || !playerStore.active) return
      if (!isIgnorablePlaybackError({
        usesLiveTranscode: true,
        isLiveStreamSeeking: true,
        mediaErrorCode: playerStore.player.error?.code,
      })) {
        failTranscode(errorMessage(error, 'Failed to change transcode quality'))
        console.warn('Failed to change transcode quality:', error)
      }
    } finally {
      if (seekGeneration === liveStreamSeekGeneration && playerStore.active) {
        playerStore.currentTime = time
        playerStore.isLiveStreamSeeking = false
        playerStore.syncPlaybackState()
      }
    }
  }

  const loadSrc = async (media: MediaItem, start_time?: number) => {
    const session = ++transcodeSessionId
    resetTranscodeState()
    directPlaybackFallbackAttempted = false
    directPlaybackFallbackInFlight = false
    liveStreamCopyCompatible = false
    liveStreamAccurateSeek = false
    clearDirectSeekStallWatch()
    await clearLiveTranscodeHandlers()
    if (isLoadSrcStale(session)) return

    playerStore.liveTranscodeStarted = false
    isReady.value = false
    playerStore.playbackError = false

    const resolved = await resolvePlayableVideo(
      playerStore.playlist,
      media,
      (filePath) => checkFileExists(filePath),
    )
    if (isLoadSrcStale(session)) return

    if (!resolved) {
      console.error('Player: No playable video found in playlist:', media?.path)
      playerStore.is_file_exists = false
      playerStore.playbackError = true
      isReady.value = true
      return
    }

    const videoEl = await ensureVideoElement()
    if (isLoadSrcStale(session)) return

    if (!videoEl) {
      console.error('Player: Video element is not available')
      playerStore.playbackError = true
      isReady.value = true
      return
    }

    const requestedMedia = media
    const requestedClip = isClipPlaylistItem(requestedMedia)
    const requestedSegmentStart = getSegmentStart(requestedMedia)
    const explicitStart = start_time != null && Number.isFinite(Number(start_time))
      ? Number(start_time)
      : undefined

    media = mergeClipFields(resolved.video, requestedMedia)
    const mediaType = findMediaTypeById(appStore.mediaTypes, media.mediaTypeId)
    playerStore.isAudioMode = isAudioMediaType(mediaType) || isAudioFilePath(media.path)
    playerStore.is_file_exists = media.path ? await checkFileExists(media.path) : false
    if (isLoadSrcStale(session)) return

    if (playerStore.playlist.length > 0) {
      playerStore.nowPlaying = resolved.index
    }

    await getMetadata(media)
    if (isLoadSrcStale(session)) return

    const metadataDuration = metadataNumber(playerStore.metadata, 'duration')
    if (metadataDuration != null && metadataDuration > 0) {
      playerStore.duration = metadataDuration
    }

    const playingClip = requestedClip || isClipPlaylistItem(media)
    const segmentStart = getSegmentStart(media) ?? requestedSegmentStart
    let targetStartTime = 0
    if (explicitStart != null) {
      targetStartTime = explicitStart
    } else if (segmentStart != null) {
      targetStartTime = segmentStart
    } else if (!playingClip && settingsStore.restorePlaybackTime == '1') {
      const metaTime = metadataNumber(playerStore.metadata, 'time')
      if (metaTime != null && metadataDuration != null) {
        if (!(metadataDuration - metaTime < 5)) {
          targetStartTime = metaTime
        }
      }
    }

    // Show clip/resume time immediately — do not wait on marks/thumbs.
    playerStore.media = media
    playerStore.currentTime = targetStartTime

    try {
      videoEl.src = await resolveVideoSource(media.id, targetStartTime)
    } catch (error) {
      if (isLoadSrcStale(session)) return
      console.error('Player: Failed to prepare video source:', error)
      await clearLiveTranscodeHandlers()
      resetTranscodeState()
      if (error instanceof UnsupportedPlaybackError) {
        playerStore.playbackError = true
      } else {
        failTranscode(errorMessage(error, 'Failed to prepare video source'))
      }
      isReady.value = true
      return
    }
    if (isLoadSrcStale(session)) {
      await clearLiveTranscodeHandlers()
      return
    }

    playerStore.trackCurrentTime()
    videoEl.playbackRate = playerStore.speed

    if (!playerStore.usesLiveTranscode) {
      if (explicitStart != null || targetStartTime > 0 || segmentStart != null) {
        await seekDirectPlaybackTo(
          videoEl,
          targetStartTime,
          () => isLoadSrcStale(session),
        )
        if (isLoadSrcStale(session)) {
          await clearLiveTranscodeHandlers()
          return
        }
        playerStore.currentTime = targetStartTime
      }
    } else {
      playerStore.liveStreamOffset = targetStartTime
      playerStore.currentTime = targetStartTime
      playerStore.bufferedRanges = []
    }

    await itemsStore.countViewNumber(media, 'media')
    if (isLoadSrcStale(session)) {
      await clearLiveTranscodeHandlers()
      return
    }

    updateItemVideo(media.id)

    playerStore.playbackError = false
    dialogsStore.closeMarkAdding()

    if (!registrationStore.reg && playerStore.nowPlaying > 14) {
      await clearLiveTranscodeHandlers()
      videoEl.src = ''
      isReady.value = true
      return
    }

    if (isPlayerWindow.value) {
      updatePlayerWindowTitle(media)
    }

    playerStore.changePlayerStatusText({
      text: `${playerStore.nowPlaying + 1}. ${media.name}`,
      icon: 'format-list-bulleted',
      large: true,
    })

    try {
      if (playerStore.usesLiveTranscode) {
        await playCurrentLiveStream()
        if (isLoadSrcStale(session)) return
        playerStore.currentTime = targetStartTime
        playerStore.syncPlaybackState()
      } else {
        await videoEl.play()
      }
      if (isLoadSrcStale(session)) return
      playerStore.paused = false
    } catch (e) {
      if (isLoadSrcStale(session)) return
      if (!playerStore.usesLiveTranscode || !isIgnorablePlaybackError({
        usesLiveTranscode: playerStore.usesLiveTranscode,
        isLiveStreamSeeking: playerStore.isLiveStreamSeeking,
        mediaErrorCode: videoEl.error?.code,
      })) {
        if (playerStore.usesLiveTranscode) {
          failTranscode(errorMessage(e, 'Live transcode playback failed'))
        }
        console.log(e)
      }
    }

    if (isLoadSrcStale(session)) return
    isReady.value = true

    // Marks/thumbs after playback starts — do not block clip start.
    void getMarks(media)
  }

  const updatePlaybackTime = async (media: MediaItem) => {
    const time = Number(playerStore.currentTime) || 0
    try {
      await typedApi.updateVideoMetadata(media.id, {
        time,
      })
      updateItemVideo(media.id, {time})
    } catch (error) {
      console.warn('Failed to save playback time:', error)
    }
  }

  const initPlayingVideo = async (
    media: MediaItem,
    videos: MediaItem[],
    time?: number,
  ) => {
    if (!media || !videos) {
      setNotification({
        type: 'error',
        title: t('player.invalid_video_data'),
        text: t('player.could_not_play_video'),
      })
      return
    }

    playerStore.playlist = videos.map((item, index): PlayerPlaylistItem => ({
      ...item,
      key: playlistItemKey(item, index),
      thumb: item.thumb
        ? (item.thumb.startsWith('http') ? item.thumb : buildApiUrl(item.thumb))
        : '/images/unavailable.png',
    }))

    isReady.value = false
    playerStore.playbackError = false
    playerStore.active = true
    updatePlayerWindowTitle(media)

    await nextTick()
    const startTime = time != null && Number.isFinite(Number(time))
      ? Number(time)
      : getSegmentStart(media)
    await loadSrc(media, startTime)

    const mediaTypeId = media.mediaTypeId || getDefaultMediaTypeId(appStore.mediaTypes)
    try {
      const res = await typedApi.getAllMetaInMediaType({mediaTypeId})
      itemsStore.assigned = res.data
    } catch (e) {
      console.log('Error loading metadata:', e)
    }
  }

  return {
    bindVideoElement,
    ensureVideoElement,
    getMarks,
    loadSrc,
    updatePlaybackTime,
    stopLiveTranscodeSession,
    clearLiveTranscodeHandlers,
    changeLiveTranscodeMaxHeight,
    initPlayingVideo,
  }
}
