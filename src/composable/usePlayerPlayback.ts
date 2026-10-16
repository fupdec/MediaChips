import {nextTick, watch, onBeforeUnmount} from 'vue'
import {abortVideoPlayback} from '@/utils/liveTranscodeLifecycle'
import {usePlayerPositionPersistence} from './usePlayerPositionPersistence'
import {disposeWebVideo} from '@/services/webVideoPlayback'
import {isRemoteMediaPath} from '@shared/remoteMedia'
import {isNasMediaPath} from '@shared/remoteMedia'
import {typedApi} from '@/services/typedApi'
import {usePlayerStore} from '@/stores/player'
import type {UsePlayerPlaybackOptions} from '@/types/player'
import {getAbsolutePlaybackTime, isIgnorablePlaybackError} from '@/utils/playerBuffer'
import {getContinuousNextChunkStart} from '@/utils/liveStreamChunk'
import {getSegmentEnd} from '@/utils/mediaItem'
import {isPlaylistNavDisabled} from '@/composable/usePlayerTransportPlayback'
import {
  metadataNumber,
  resolveDurationOnLoadedMetadata,
  resolveEndedLiveNextStart,
  resolveLiveHandoffElapsed,
  shouldAdvanceAtSegmentEnd,
} from '@/utils/playerPlaybackResolve'
import {
  createPlayerLiveSession,
  type PlayerPlaybackSharedState,
} from '@/composable/usePlayerLiveSession'
import {createPlayerLoadSrc} from '@/composable/usePlayerLoadSrc'
import {maybeRefillSimilarRadio} from '@/services/similarRadio'

export {
  getLiveChunkRelativeTime,
  isLoadSrcSessionStale,
  resolveLiveHandoffElapsed,
  resolvePlayableVideo,
} from '@/utils/playerPlaybackResolve'
export {createPlayerLiveSession, seekDirectPlaybackTo} from '@/composable/usePlayerLiveSession'
export {createPlayerLoadSrc} from '@/composable/usePlayerLoadSrc'
export type {PlayerPlaybackSharedState} from '@/composable/usePlayerLiveSession'

export function usePlayerPlayback({
  isReady,
  videoPlayer,
  controls,
  marks,
  isPlayerWindow,
  updateItemVideo,
  updatePlayerWindowTitle,
}: UsePlayerPlaybackOptions) {
  const playerStore = usePlayerStore()
  const state: PlayerPlaybackSharedState = {
    forceDirectPlayback: false,
    liveStreamSeekGeneration: 0,
    currentLiveMediaId: null,
    directPlaybackFallbackAttempted: false,
    directPlaybackFallbackInFlight: false,
    liveStreamCopyCompatible: false,
    liveStreamAccurateSeek: false,
    transcodeSessionId: 0,
    isAdvancingChunk: false,
    pendingNextChunkStart: null,
    directSeekStallTimer: null,
  }
  const liveSession = createPlayerLiveSession(state)
  let segmentAdvancePending = false

  const finishCurrentClipSegment = () => {
    const current = playerStore.playlist[playerStore.nowPlaying]
    const segmentEnd = getSegmentEnd(current)
    if (segmentEnd == null) return false
    if (
      segmentAdvancePending
      || !playerStore.active
      || !controls.value
      || playerStore.isLiveStreamSeeking
      || state.isAdvancingChunk
    ) return false

    const stopAtSegmentEnd = () => {
      playerStore.playerPause()
      if (playerStore.player && !playerStore.usesLiveTranscode) {
        const duration = Number(playerStore.player.duration)
        const clampedEnd = Number.isFinite(duration) && duration > 0
          ? Math.min(segmentEnd, Math.max(0, duration - 0.05))
          : segmentEnd
        playerStore.player.currentTime = clampedEnd
      }
      playerStore.syncPlaybackState()
    }

    segmentAdvancePending = true
    try {
      liveSession.seekLiveStream.cancel?.()
      liveSession.maybeAdvanceLiveStreamChunk.cancel?.()
      state.liveStreamSeekGeneration += 1
      state.isAdvancingChunk = false
      state.pendingNextChunkStart = null
      const canAutoplayNext = playerStore.playlistMode.includes('autoplay')
        && !isPlaylistNavDisabled({
          playlistMode: playerStore.playlistMode,
          playlistShuffle: playerStore.playlistShuffle,
          nowPlaying: playerStore.nowPlaying,
          playlistLength: playerStore.playlist.length,
          direction: 'next',
        })
      if (canAutoplayNext) controls.value?.next?.()
      else stopAtSegmentEnd()
      return true
    } finally {
      window.setTimeout(() => {
        segmentAdvancePending = false
      }, 250)
    }
  }

  const maybeAdvanceSegmentPlaylist = () => {
    const current = playerStore.playlist[playerStore.nowPlaying]
    const segmentEnd = getSegmentEnd(current)
    if (!shouldAdvanceAtSegmentEnd({
      segmentAdvancePending,
      active: playerStore.active,
      hasControls: Boolean(controls.value),
      isLiveStreamSeeking: playerStore.isLiveStreamSeeking,
      isAdvancingChunk: state.isAdvancingChunk,
      segmentEnd,
      currentTime: Number(playerStore.currentTime),
    })) return
    finishCurrentClipSegment()
  }

  const handleVideoElementError = async () => {
    if (!playerStore.active || !playerStore.player?.src) return
    if (isIgnorablePlaybackError({
      usesLiveTranscode: playerStore.usesLiveTranscode,
      isLiveStreamSeeking: playerStore.isLiveStreamSeeking,
      mediaErrorCode: playerStore.player.error?.code,
    })) return
    if (!isRemoteMediaPath(playerStore.media?.path)
      && await liveSession.tryFallbackDirectToLiveTranscode(playerStore.player.error?.code)) return
    playerStore.playbackError = true
    playerStore.webVideoFrameReady = false
    playerStore.isStreamWaiting = false
    if (playerStore.usesLiveTranscode) {
      liveSession.failTranscode(playerStore.player.error?.message || 'Playback failed')
    }
  }

  const initPlayer = () => {
    if (!playerStore.player || playerStore.player.dataset.playerBound === '1') return
    playerStore.player.dataset.playerBound = '1'
    isReady.value = false
    playerStore.player.addEventListener('loadedmetadata', () => {
      const videoEl = playerStore.player
      if (!videoEl) return
      const duration = resolveDurationOnLoadedMetadata({
        usesLiveTranscode: playerStore.usesLiveTranscode,
        metadataDuration: metadataNumber(playerStore.metadata, 'duration'),
        elementDuration: videoEl.duration,
      })
      if (duration != null) playerStore.duration = duration
      const media = playerStore.media
      if (media && isNasMediaPath(media.path) && Number.isFinite(videoEl.duration) && videoEl.duration > 0
        && (!metadataNumber(playerStore.metadata, 'duration') || !metadataNumber(playerStore.metadata, 'width'))) {
        const metadata = {duration: videoEl.duration, width: videoEl.videoWidth, height: videoEl.videoHeight}
        playerStore.metadata = {...playerStore.metadata, ...metadata}
        if (media.id > 0) void typedApi.updateVideoMetadata(media.id, metadata).catch(() => {})
      }
      playerStore.syncPlaybackState()
    })
    playerStore.player.addEventListener('timeupdate', () => {
      if (playerStore.webVideoLoading) return
      playerStore.syncPlaybackState()
      liveSession.maybeAdvanceLiveStreamChunk()
      maybeAdvanceSegmentPlaylist()
    })
    playerStore.player.addEventListener('progress', () => {
      playerStore.syncPlaybackState()
    })
    playerStore.player.addEventListener('ended', async () => {
      playerStore.isStreamWaiting = false
      if (playerStore.isWebVideo) playerStore.paused = true
      const current = playerStore.playlist[playerStore.nowPlaying]
      const segmentEnd = getSegmentEnd(current)

      if (playerStore.usesLiveTranscode) {
        const continuousNextStart = getContinuousNextChunkStart(
          playerStore.liveStreamOffset,
          resolveLiveHandoffElapsed(playerStore.player),
          liveSession.getLiveFileDuration(),
        )
        const absoluteTime = getAbsolutePlaybackTime({
          usesLiveTranscode: true,
          liveStreamOffset: playerStore.liveStreamOffset,
          playerCurrentTime: playerStore.player?.currentTime,
        })
        const {nextStart, stillInsideSegment} = resolveEndedLiveNextStart({
          continuousNextStart,
          absoluteTime,
          segmentEnd,
        })
        const canContinueSegment = stillInsideSegment
          && nextStart != null
          && nextStart > Number(playerStore.liveStreamOffset) + 0.05
          && (segmentEnd == null || nextStart < segmentEnd - 0.05)
        if (canContinueSegment) {
          const advanced = await liveSession.switchLiveStreamChunk(nextStart)
          if (advanced) return
        }
        // EOF / failed handoff inside a ranged clip: finish the clip instead of
        // freezing on the last frame until segmentEnd (often ~tens of seconds).
        if (segmentEnd != null && finishCurrentClipSegment()) return
      } else if (segmentEnd != null && finishCurrentClipSegment()) {
        return
      }

      maybeRefillSimilarRadio()
      if (playerStore.playlistMode.includes('autoplay') && controls.value) {
        controls.value.next?.()
      }
    })
    playerStore.player.addEventListener('error', () => {
      void handleVideoElementError()
    })
    playerStore.player.addEventListener('seeking', () => {
      if (playerStore.isWebVideo) {
        playerStore.isStreamWaiting = true
        playerStore.webVideoFrameReady = false
        return
      }
      if (!playerStore.usesLiveTranscode) liveSession.armDirectSeekStallWatch()
    })
    playerStore.player.addEventListener('seeked', () => {
      liveSession.clearDirectSeekStallWatch()
      if (playerStore.isWebVideo) {
        playerStore.isStreamWaiting = false
        playerStore.webVideoFrameReady = Boolean(playerStore.player && playerStore.player.readyState >= 2)
      }
    })
    const onWebFrameReady = () => {
      if (!playerStore.isWebVideo) return
      playerStore.isStreamWaiting = false
      playerStore.webVideoFrameReady = Boolean(playerStore.player && playerStore.player.readyState >= 2 && !playerStore.player.seeking)
    }
    playerStore.player.addEventListener('loadeddata', onWebFrameReady)
    playerStore.player.addEventListener('canplay', onWebFrameReady)
    playerStore.player.addEventListener('pause', () => {
      if (playerStore.isWebVideo && !playerStore.webVideoLoading && !playerStore.playbackError
        && playerStore.player?.paused) playerStore.paused = true
    })
    playerStore.player.addEventListener('waiting', () => {
      if (playerStore.isWebVideo) { playerStore.isStreamWaiting = true; return }
      if (!playerStore.usesLiveTranscode) {
        // The watchdog only accepts suspect codec/container plans. Normal
        // buffering on slow disks or NAS must not promote a healthy original.
        const currentTime = Number(playerStore.player?.currentTime) || 0
        if (currentTime > 2) {
          liveSession.armDirectSeekStallWatch()
        }
        return
      }
      playerStore.isStreamWaiting = true
    })
    playerStore.player.addEventListener('playing', () => {
      liveSession.clearDirectSeekStallWatch()
      if (playerStore.isWebVideo) {
        onWebFrameReady()
        if (!playerStore.webVideoLoading) playerStore.paused = false
      }
      if (!playerStore.usesLiveTranscode) {
        // Direct path may have leftover background status from a prior live item.
        if (playerStore.backgroundStatusText) playerStore.clearBackgroundStatus()
        return
      }
      playerStore.liveTranscodeStarted = true
      playerStore.isStreamWaiting = false
      playerStore.playbackError = false
      playerStore.isLiveStreamSeeking = false
    })
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

  const loadSrcSession = createPlayerLoadSrc({
    state,
    liveSession,
    isReady,
    marks,
    isPlayerWindow,
    updateItemVideo,
    updatePlayerWindowTitle,
    ensureVideoElement,
  })

  usePlayerPositionPersistence(playerStore, isReady, loadSrcSession.updatePlaybackTime)

  watch(() => playerStore.active, (active) => {
    if (!active) {
      ++state.transcodeSessionId
      loadSrcSession.disposeRemoteLoad()
      disposeWebVideo(playerStore.player)
      abortVideoPlayback(playerStore.player)
      clearInterval(playerStore.currentTimeTimeout)
      void liveSession.clearLiveTranscodeHandlers()
    }
  }, {flush: 'sync'})
  onBeforeUnmount(() => {
    ++state.transcodeSessionId
    loadSrcSession.disposeRemoteLoad()
    disposeWebVideo(playerStore.player)
    abortVideoPlayback(playerStore.player)
    clearInterval(playerStore.currentTimeTimeout)
    void liveSession.clearLiveTranscodeHandlers()
  })

  return {
    bindVideoElement,
    ensureVideoElement,
    getMarks: loadSrcSession.getMarks,
    loadSrc: loadSrcSession.loadSrc,
    reloadWebVideo: loadSrcSession.reloadWebVideo,
    updatePlaybackTime: loadSrcSession.updatePlaybackTime,
    stopLiveTranscodeSession: liveSession.stopLiveTranscodeSession,
    clearLiveTranscodeHandlers: liveSession.clearLiveTranscodeHandlers,
    changeLiveTranscodeMaxHeight: liveSession.changeLiveTranscodeMaxHeight,
    disableLiveTranscode: liveSession.disableLiveTranscode,
    initPlayingVideo: loadSrcSession.initPlayingVideo,
  }
}
