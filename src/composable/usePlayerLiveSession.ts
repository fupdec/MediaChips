import { debounce } from '@/utils/debounce'
import {useI18n} from 'vue-i18n'
import {usePlayerStore} from '@/stores/player'
import {useSettingsStore} from '@/stores/settings'
import {buildApiUrl} from '@/services/apiClient'
import {isIgnorablePlaybackError} from '@/utils/playerBuffer'
import {getContinuousNextChunkStart, resolveLiveFileDuration} from '@/utils/liveStreamChunk'
import {
  buildVideoStreamUrl,
  buildLiveStreamUrl,
  playLiveStreamWhenReady,
  shouldAttemptDirectPlaybackFallback,
  stopLiveTranscode,
} from '@/services/transcodeService'
import {
  clearLiveTranscodeSessionMark,
  markLiveTranscodeSession,
} from '@/utils/liveTranscodeLifecycle'
import {
  getLiveChunkRelativeTime,
  metadataNumber,
  normalizeTranscodeMaxHeight,
  playbackErrorMessage,
  resolveCurrentPlaybackMediaId,
  resolveDirectPlaybackFallbackBegin,
  resolveFallbackResumeStreamStart,
  resolveLiveChunkEndMark,
  resolveLiveChunkRelativeSeekTarget,
  resolveLiveSeekStrategy,
  resolveLiveStreamUrlOptions,
  shouldArmDirectSeekStallWatch,
  shouldHandOffLiveStreamChunk,
  shouldSkipLiveQualityChange,
  shouldTriggerDirectSeekStallFallback,
} from '@/utils/playerPlaybackResolve'

export interface PlayerPlaybackSharedState {
  forceDirectPlayback: boolean
  liveStreamSeekGeneration: number
  currentLiveMediaId: number | null
  directPlaybackFallbackAttempted: boolean
  directPlaybackFallbackInFlight: boolean
  liveStreamCopyCompatible: boolean
  liveStreamAccurateSeek: boolean
  transcodeSessionId: number
  isAdvancingChunk: boolean
  pendingNextChunkStart: number | null
  directSeekStallTimer: ReturnType<typeof setTimeout> | null
}

function applyLiveChunkRelativeSeek(
  videoEl: HTMLVideoElement | null | undefined,
  absoluteTime: number,
  chunkStart: number,
) {
  if (!videoEl) return
  const relative = resolveLiveChunkRelativeSeekTarget(
    videoEl.currentTime || 0,
    absoluteTime,
    chunkStart,
  )
  if (relative != null) videoEl.currentTime = relative
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

export async function seekDirectPlaybackTo(
  videoEl: HTMLVideoElement,
  time: number,
  isCancelled?: () => boolean,
) {
  let target = Math.max(0, Number(time) || 0)
  if (!Number.isFinite(target)) return
  if (videoEl.readyState < HTMLMediaElement.HAVE_METADATA) {
    await waitForMediaEvent(videoEl, 'loadedmetadata')
    if (isCancelled?.()) return
  }
  const fileDuration = Number(videoEl.duration)
  if (Number.isFinite(fileDuration) && fileDuration > 0) {
    target = Math.min(target, Math.max(0, fileDuration - 0.05))
  }
  if (Math.abs((videoEl.currentTime || 0) - target) <= 0.12) return
  videoEl.currentTime = target
  await waitForMediaEvent(videoEl, 'seeked', 4000)
}

export function createPlayerLiveSession(state: PlayerPlaybackSharedState) {
  const playerStore = usePlayerStore()
  const settingsStore = useSettingsStore()
  const {t} = useI18n()

  const getLiveFileDuration = () => resolveLiveFileDuration({
    metadataDuration: metadataNumber(playerStore.metadata, 'duration'),
    storeDuration: playerStore.duration,
    liveStreamOffset: playerStore.liveStreamOffset,
  })

  const clearDirectSeekStallWatch = () => {
    if (state.directSeekStallTimer == null) return
    clearTimeout(state.directSeekStallTimer)
    state.directSeekStallTimer = null
  }

  const resetTranscodeState = () => {
    playerStore.transcodeStatus = 'none'
    playerStore.transcodeError = null
  }

  const liveStreamUrlOptions = () => resolveLiveStreamUrlOptions({
    copyCompatible: state.liveStreamCopyCompatible,
    accurateSeek: state.liveStreamAccurateSeek,
  })

  const failTranscode = (message?: string) => {
    playerStore.transcodeStatus = 'error'
    playerStore.transcodeError = message || 'Live transcode failed'
    playerStore.playbackError = true
  }

  const playCurrentLiveStream = () => {
    const videoEl = playerStore.player
    const mediaId = state.currentLiveMediaId
    if (!videoEl || mediaId == null) return Promise.resolve()
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

  const stopLiveTranscodeSession = (
    mediaId: number | null = state.currentLiveMediaId,
  ) => {
    if (mediaId == null) return Promise.resolve()
    return stopLiveTranscode(mediaId).catch((error) => {
      console.warn('Failed to stop live transcode session:', error)
    })
  }

  const clearLiveTranscodeHandlers = async () => {
    const stoppingMediaId = state.currentLiveMediaId
    playerStore.usesLiveTranscode = false
    playerStore.liveTranscodeStarted = false
    playerStore.liveTranscodeMediaId = null
    playerStore.liveTranscodeMaxHeight = '1080'
    playerStore.liveStreamSeekHandler = null
    playerStore.liveStreamOffset = 0
    playerStore.bufferedRanges = []
    playerStore.isLiveStreamSeeking = false
    playerStore.isStreamWaiting = false
    state.currentLiveMediaId = null
    state.liveStreamCopyCompatible = false
    state.liveStreamAccurateSeek = false
    state.isAdvancingChunk = false
    state.pendingNextChunkStart = null
    state.liveStreamSeekGeneration += 1
    seekLiveStream.cancel?.()
    maybeAdvanceLiveStreamChunk.cancel?.()
    clearDirectSeekStallWatch()
    clearLiveTranscodeSessionMark()
    if (stoppingMediaId) await stopLiveTranscodeSession(stoppingMediaId)
  }

  const resolveCurrentMediaId = (): number | null => resolveCurrentPlaybackMediaId({
    currentLiveMediaId: state.currentLiveMediaId,
    liveTranscodeMediaId: playerStore.liveTranscodeMediaId,
    mediaId: playerStore.media?.id,
    playlistItemId: playerStore.playlist[playerStore.nowPlaying]?.id,
  })

  const tryFallbackDirectToLiveTranscode = async (mediaErrorCode?: number) => {
    const begin = resolveDirectPlaybackFallbackBegin({
      inFlight: state.directPlaybackFallbackInFlight,
      liveTranscodeDisabled: playerStore.liveTranscodeDisabled,
      forceDirectPlayback: state.forceDirectPlayback,
    })
    if (begin.kind === 'busy') return true
    if (begin.kind === 'blocked') return false

    const media = playerStore.media || playerStore.playlist[playerStore.nowPlaying] || null
    const mediaId = media?.id ?? state.currentLiveMediaId
    if (!shouldAttemptDirectPlaybackFallback({
      usesLiveTranscode: playerStore.usesLiveTranscode,
      fallbackAttempted: state.directPlaybackFallbackAttempted,
      transcodeEnabled: settingsStore.transcodeUnsupportedFormats === '1',
      mediaErrorCode,
    })) return false
    if (mediaId == null || !playerStore.player) return false

    state.directPlaybackFallbackAttempted = true
    state.directPlaybackFallbackInFlight = true
    const streamStart = resolveFallbackResumeStreamStart(
      playerStore.player.currentTime,
      playerStore.currentTime || 0,
    )
    try {
      state.currentLiveMediaId = mediaId
      state.liveStreamCopyCompatible = false
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
      failTranscode(playbackErrorMessage(error, 'Playback failed after transcode fallback'))
      return true
    } finally {
      state.directPlaybackFallbackInFlight = false
    }
  }

  const armDirectSeekStallWatch = (delayMs = 2500) => {
    if (!shouldArmDirectSeekStallWatch({
      usesLiveTranscode: playerStore.usesLiveTranscode,
      fallbackAttempted: state.directPlaybackFallbackAttempted,
    })) return
    clearDirectSeekStallWatch()
    state.directSeekStallTimer = setTimeout(() => {
      state.directSeekStallTimer = null
      const videoEl = playerStore.player
      if (!shouldTriggerDirectSeekStallFallback({
        active: playerStore.active,
        usesLiveTranscode: playerStore.usesLiveTranscode,
        hasSrc: Boolean(videoEl?.src),
        seeking: Boolean(videoEl?.seeking),
        readyState: Number(videoEl?.readyState) || 0,
      })) return
      void tryFallbackDirectToLiveTranscode(3)
    }, delayMs)
  }

  const startLiveTranscodeAt = async (
    mediaId: number,
    startTime: number,
    maxHeight: string,
  ) => {
    const streamStart = Math.max(0, Number(startTime) || 0)
    const videoEl = playerStore.player
    if (!videoEl || !playerStore.active) return
    state.forceDirectPlayback = false
    playerStore.liveTranscodeDisabled = false
    playerStore.liveTranscodeOfferable = true
    state.currentLiveMediaId = mediaId
    state.liveStreamCopyCompatible = false
    state.liveStreamAccurateSeek = false
    playerStore.usesLiveTranscode = true
    playerStore.liveTranscodeMediaId = mediaId
    playerStore.liveTranscodeMaxHeight = maxHeight
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
    videoEl.src = buildLiveStreamUrl(
      buildApiUrl,
      mediaId,
      streamStart,
      maxHeight,
      liveStreamUrlOptions(),
    )
    await playCurrentLiveStream()
    if (!playerStore.active) return
    playerStore.paused = false
    playerStore.isLiveStreamSeeking = false
    playerStore.syncPlaybackState()
  }

  const disableLiveTranscode = async () => {
    const mediaId = resolveCurrentMediaId()
    const videoEl = playerStore.player
    if (mediaId == null || !videoEl || !playerStore.active) return
    if (playerStore.liveTranscodeDisabled && !playerStore.usesLiveTranscode) return
    const time = Math.max(
      0,
      Number(playerStore.currentTime) || Number(videoEl.currentTime) || 0,
    )
    const wasPaused = playerStore.paused
    state.forceDirectPlayback = true
    playerStore.liveTranscodeDisabled = true
    playerStore.liveTranscodeOfferable = true
    playerStore.isLiveStreamSeeking = true
    playerStore.playbackError = false
    await clearLiveTranscodeHandlers()
    state.forceDirectPlayback = true
    playerStore.liveTranscodeDisabled = true
    playerStore.liveTranscodeOfferable = true
    if (!playerStore.active) return
    const seekGeneration = ++state.liveStreamSeekGeneration
    videoEl.src = buildVideoStreamUrl(buildApiUrl, mediaId, 'direct')
    playerStore.currentTime = time
    try {
      await seekDirectPlaybackTo(
        videoEl,
        time,
        () => seekGeneration !== state.liveStreamSeekGeneration || !playerStore.active,
      )
      if (seekGeneration !== state.liveStreamSeekGeneration || !playerStore.active) return
      if (!wasPaused) {
        await videoEl.play()
        playerStore.paused = false
      }
      playerStore.changePlayerStatusText({
        text: t('player.controls.transcode_off'),
        icon: 'video-off',
      })
    } catch (error) {
      if (seekGeneration !== state.liveStreamSeekGeneration || !playerStore.active) return
      console.warn('Failed to switch to direct playback:', error)
      playerStore.playbackError = true
    } finally {
      if (seekGeneration === state.liveStreamSeekGeneration && playerStore.active) {
        playerStore.isLiveStreamSeeking = false
        playerStore.syncPlaybackState()
      }
    }
  }

  const switchLiveStreamChunk = async (nextChunkStart: number) => {
    if (
      !state.currentLiveMediaId
      || !playerStore.player
      || !playerStore.active
      || nextChunkStart == null
    ) return false
    const seekGeneration = ++state.liveStreamSeekGeneration
    state.isAdvancingChunk = true
    state.pendingNextChunkStart = null
    state.liveStreamAccurateSeek = false
    const wasPaused = playerStore.paused
    playerStore.isLiveStreamSeeking = true
    playerStore.playbackError = false
    playerStore.liveStreamOffset = nextChunkStart
    playerStore.bufferedRanges = []
    playerStore.player.src = buildLiveStreamUrl(
      buildApiUrl,
      state.currentLiveMediaId,
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
      if (
        seekGeneration === state.liveStreamSeekGeneration
        && !isIgnorablePlaybackError({
          usesLiveTranscode: true,
          isLiveStreamSeeking: true,
          mediaErrorCode: playerStore.player.error?.code,
        })
      ) console.log(error)
    } finally {
      if (seekGeneration === state.liveStreamSeekGeneration) {
        state.isAdvancingChunk = false
        playerStore.isLiveStreamSeeking = false
        playerStore.syncPlaybackState()
      }
    }
    return seekGeneration === state.liveStreamSeekGeneration
  }

  const maybeAdvanceLiveStreamChunk = debounce(async () => {
    const relativeTime = playerStore.player?.currentTime || 0
    const endMark = resolveLiveChunkEndMark(Number(playerStore.player?.duration))
    if (!shouldHandOffLiveStreamChunk({
      usesLiveTranscode: playerStore.usesLiveTranscode,
      hasPlayer: Boolean(playerStore.player),
      active: playerStore.active,
      isAdvancingChunk: state.isAdvancingChunk,
      isLiveStreamSeeking: playerStore.isLiveStreamSeeking,
      paused: playerStore.paused,
      relativeTime,
      endMark,
    })) return
    const nextStart = getContinuousNextChunkStart(
      playerStore.liveStreamOffset,
      relativeTime,
      getLiveFileDuration(),
    )
    if (nextStart == null || state.pendingNextChunkStart === nextStart) return
    state.pendingNextChunkStart = nextStart
    await switchLiveStreamChunk(nextStart)
  }, 200)

  const seekLiveStream = debounce(async (time: number) => {
    if (
      !state.currentLiveMediaId
      || !playerStore.player
      || !playerStore.active
      || !playerStore.usesLiveTranscode
    ) return
    const seekTime = Math.max(0, Number(time) || 0)
    const streamStart = playerStore.liveStreamOffset
    const relative = getLiveChunkRelativeTime(seekTime, streamStart)
    const bufferedEnd = playerStore.player.buffered?.length
      ? playerStore.player.buffered.end(playerStore.player.buffered.length - 1)
      : 0
    const strategy = resolveLiveSeekStrategy({
      seekTime,
      streamStart,
      relative,
      bufferedEnd,
      hasSrc: Boolean(playerStore.player.src),
      isAdvancingChunk: state.isAdvancingChunk,
    })
    if (strategy.kind === 'noop-at-stream-start') {
      playerStore.currentTime = seekTime
      playerStore.syncPlaybackState()
      return
    }
    if (strategy.kind === 'relative-in-buffer') {
      applyLiveChunkRelativeSeek(playerStore.player, seekTime, streamStart)
      playerStore.currentTime = seekTime
      playerStore.syncPlaybackState()
      return
    }
    const seekGeneration = ++state.liveStreamSeekGeneration
    const wasPaused = playerStore.paused
    state.isAdvancingChunk = false
    state.pendingNextChunkStart = null
    state.liveStreamAccurateSeek = false
    playerStore.isLiveStreamSeeking = true
    playerStore.playbackError = false
    playerStore.liveStreamOffset = seekTime
    playerStore.bufferedRanges = []
    playerStore.player.src = buildLiveStreamUrl(
      buildApiUrl,
      state.currentLiveMediaId,
      seekTime,
      playerStore.liveTranscodeMaxHeight,
      liveStreamUrlOptions(),
    )
    playerStore.currentTime = seekTime
    const onPlaying = () => {
      if (seekGeneration !== state.liveStreamSeekGeneration) return
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
        if (seekGeneration !== state.liveStreamSeekGeneration) return
        if (isIgnorablePlaybackError({
          usesLiveTranscode: true,
          isLiveStreamSeeking: true,
          mediaErrorCode: playerStore.player.error?.code,
        })) return
        console.log(error)
      }
    }
    if (seekGeneration !== state.liveStreamSeekGeneration) return
    playerStore.currentTime = seekTime
    playerStore.syncPlaybackState()
    window.setTimeout(() => {
      if (
        seekGeneration === state.liveStreamSeekGeneration
        && playerStore.isLiveStreamSeeking
      ) playerStore.isLiveStreamSeeking = false
    }, 15000)
  }, 250)

  const changeLiveTranscodeMaxHeight = async (maxHeight: number | string) => {
    const normalized = String(maxHeight)
    const mediaId = resolveCurrentMediaId()
    if (!playerStore.player || mediaId == null || !playerStore.active) return
    if (playerStore.liveTranscodeDisabled || !playerStore.usesLiveTranscode) {
      if (!playerStore.liveTranscodeOfferable) return
      const time = Math.max(0, Number(playerStore.currentTime) || 0)
      const wasPaused = playerStore.paused
      const seekGeneration = ++state.liveStreamSeekGeneration
      try {
        await startLiveTranscodeAt(mediaId, time, normalized)
        if (seekGeneration !== state.liveStreamSeekGeneration || !playerStore.active) return
        if (wasPaused) playerStore.playerPause()
      } catch (error) {
        if (seekGeneration !== state.liveStreamSeekGeneration || !playerStore.active) return
        failTranscode(playbackErrorMessage(error, 'Failed to enable live transcode'))
        console.warn('Failed to enable live transcode:', error)
      }
      return
    }
    if (shouldSkipLiveQualityChange({
      normalizedMaxHeight: normalized,
      currentMaxHeight: playerStore.liveTranscodeMaxHeight,
      liveStreamCopyCompatible: state.liveStreamCopyCompatible,
    })) return
    seekLiveStream.cancel?.()
    maybeAdvanceLiveStreamChunk.cancel?.()
    const seekGeneration = ++state.liveStreamSeekGeneration
    state.isAdvancingChunk = false
    state.pendingNextChunkStart = null
    const time = Math.max(0, Number(playerStore.currentTime) || 0)
    const wasPaused = playerStore.paused
    const liveMediaId = state.currentLiveMediaId
    if (liveMediaId == null) return
    state.liveStreamCopyCompatible = false
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
          playerStore.player,
          () => buildLiveStreamUrl(
            buildApiUrl,
            liveMediaId,
            time,
            normalized,
            liveStreamUrlOptions(),
          ),
          {isCancelled: () => !playerStore.active},
        )
        if (seekGeneration !== state.liveStreamSeekGeneration || !playerStore.active) return
        playerStore.paused = false
      }
    } catch (error) {
      if (seekGeneration !== state.liveStreamSeekGeneration || !playerStore.active) return
      if (!isIgnorablePlaybackError({
        usesLiveTranscode: true,
        isLiveStreamSeeking: true,
        mediaErrorCode: playerStore.player.error?.code,
      })) {
        failTranscode(playbackErrorMessage(error, 'Failed to change transcode quality'))
        console.warn('Failed to change transcode quality:', error)
      }
    } finally {
      if (seekGeneration === state.liveStreamSeekGeneration && playerStore.active) {
        playerStore.currentTime = time
        playerStore.isLiveStreamSeeking = false
        playerStore.syncPlaybackState()
      }
    }
  }

  return {
    armDirectSeekStallWatch,
    changeLiveTranscodeMaxHeight,
    clearDirectSeekStallWatch,
    clearLiveTranscodeHandlers,
    disableLiveTranscode,
    failTranscode,
    getLiveFileDuration,
    liveStreamUrlOptions,
    maybeAdvanceLiveStreamChunk,
    playCurrentLiveStream,
    resetTranscodeState,
    seekLiveStream,
    stopLiveTranscodeSession,
    switchLiveStreamChunk,
    tryFallbackDirectToLiveTranscode,
  }
}
