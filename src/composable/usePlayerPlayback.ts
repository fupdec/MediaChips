import {nextTick} from 'vue'
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
    if (await liveSession.tryFallbackDirectToLiveTranscode(playerStore.player.error?.code)) return
    playerStore.playbackError = true
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
      playerStore.syncPlaybackState()
    })
    playerStore.player.addEventListener('timeupdate', () => {
      playerStore.syncPlaybackState()
      liveSession.maybeAdvanceLiveStreamChunk()
      maybeAdvanceSegmentPlaylist()
    })
    playerStore.player.addEventListener('progress', () => {
      playerStore.syncPlaybackState()
    })
    playerStore.player.addEventListener('ended', async () => {
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
      if (!playerStore.usesLiveTranscode) liveSession.armDirectSeekStallWatch()
    })
    playerStore.player.addEventListener('seeked', () => {
      liveSession.clearDirectSeekStallWatch()
    })
    playerStore.player.addEventListener('waiting', () => {
      if (!playerStore.usesLiveTranscode) {
        // Cold-start / NAS buffering always fires `waiting` with readyState < 3.
        // Arming stall fallback there falsely flipped healthy direct plays into live
        // transcode (spinner + HD icon). Only watch mid-playback freezes, and use a
        // longer grace so slow volumes do not false-promote to live encode.
        const currentTime = Number(playerStore.player?.currentTime) || 0
        if (currentTime > 2) {
          liveSession.armDirectSeekStallWatch(8000)
        }
        return
      }
      playerStore.isStreamWaiting = true
    })
    playerStore.player.addEventListener('playing', () => {
      liveSession.clearDirectSeekStallWatch()
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

  return {
    bindVideoElement,
    ensureVideoElement,
    getMarks: loadSrcSession.getMarks,
    loadSrc: loadSrcSession.loadSrc,
    updatePlaybackTime: loadSrcSession.updatePlaybackTime,
    stopLiveTranscodeSession: liveSession.stopLiveTranscodeSession,
    clearLiveTranscodeHandlers: liveSession.clearLiveTranscodeHandlers,
    changeLiveTranscodeMaxHeight: liveSession.changeLiveTranscodeMaxHeight,
    disableLiveTranscode: liveSession.disableLiveTranscode,
    initPlayingVideo: loadSrcSession.initPlayingVideo,
  }
}
