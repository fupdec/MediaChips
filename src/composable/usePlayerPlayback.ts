import path from 'path-browserify'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {buildLocalFileUrl, createThumb} from '@/services/fileService'
import {saveWebVideoCurrentFrame} from '@/services/webVideoFrames'
import {invalidateVideoThumbCaches} from '@/utils/thumbDisplayCache'
import {useI18n} from 'vue-i18n'
import {remoteMediaError, remoteSourceErrorMessage} from '@/services/remoteSourceErrors'
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
import {acquireNativeElement, isNativeElement, isNativePlayerAvailable, stopNativePlayback} from '@/services/nativePlayer'

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
  const {t} = useI18n()
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
  const appStore = useAppStore()
  const itemsStore = useItemsStore()
  let openingGeneration = 0
  let openingThumbChecked = false
  watch(() => [playerStore.media?.id, playerStore.active] as const, () => {
    openingGeneration += 1
    openingThumbChecked = false
  }, {flush: 'sync'})

  const ensureOpeningThumb = async () => {
    const media = playerStore.media
    const video = playerStore.player
    if (openingThumbChecked || !playerStore.active || !playerStore.isLibraryMedia
      || playerStore.isAudioMode || !media?.path || !appStore.mediaPath || !video
      || video.readyState < 2 || video.seeking || !video.videoWidth || !video.videoHeight) return
    openingThumbChecked = true
    const generation = openingGeneration
    const isCurrent = () => generation === openingGeneration && playerStore.player === video
    const thumbPath = path.join(appStore.mediaPath, 'videos/thumbs', `${media.id}.jpg`)
    try {
      // Only a confirmed missing file permits automatic poster creation.
      const response = await fetch(buildLocalFileUrl(thumbPath, false, true), {method: 'HEAD'})
      if (response.status !== 404 || !isCurrent() || video.seeking) return
      if (isRemoteMediaPath(media.path)) {
        if (!await saveWebVideoCurrentFrame({video, mediaId: media.id, mediaPath: media.path})) return
      } else {
        await createThumb(video.currentTime, media.path, thumbPath, 320, false)
      }
      invalidateVideoThumbCaches(media.id)
      itemsStore.refreshThumb(media.id, {regenerate: false})
      if (isPlayerWindow.value && window.electronAPI?.send) {
        window.electronAPI.send('updateVideoFrames', media.id)
      }
    } catch (error) {
      if (import.meta.env.DEV) console.debug('Unable to create opening video thumb', media.id, error)
    }
  }

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
    if (isRemoteMediaPath(playerStore.media?.path) && !playerStore.transcodeError) {
      playerStore.transcodeError = remoteSourceErrorMessage(remoteMediaError(playerStore.player.error), t)
    }
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
    const applyElementDuration = () => {
      const videoEl = playerStore.player
      if (!videoEl) return
      const storedDuration = metadataNumber(playerStore.metadata, 'duration')
      const duration = resolveDurationOnLoadedMetadata({
        usesLiveTranscode: playerStore.usesLiveTranscode,
        metadataDuration: storedDuration,
        elementDuration: videoEl.duration,
      })
      if (duration != null) playerStore.duration = duration
      const media = playerStore.media
      const actual = Number(videoEl.duration)
      // A NAS card may carry a missing or wrong probed duration (e.g. 1 s): the opened file is the truth.
      if (media && isNasMediaPath(media.path) && !playerStore.usesLiveTranscode && Number.isFinite(actual) && actual > 0
        && (!storedDuration || Math.abs(storedDuration - actual) > 1 || !metadataNumber(playerStore.metadata, 'width'))) {
        const metadata = {duration: actual, width: videoEl.videoWidth || metadataNumber(playerStore.metadata, 'width') || 0, height: videoEl.videoHeight || metadataNumber(playerStore.metadata, 'height') || 0}
        playerStore.metadata = {...playerStore.metadata, ...metadata}
        if (media.id > 0) void typedApi.updateVideoMetadata(media.id, metadata).catch(() => {})
      }
      playerStore.syncPlaybackState()
    }
    playerStore.player.addEventListener('loadedmetadata', applyElementDuration)
    // mpv learns the duration after the file is opened (and can refine it while streaming).
    playerStore.player.addEventListener('durationchange', applyElementDuration)
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
    // A verified-copy stream (NAS/cloud) keeps its original path, so it is not a
    // "web video", but it stalls on the network just the same and needs the spinner.
    const isCopyStream = () => (playerStore.usesCopySource || playerStore.nativeEngine) && !playerStore.isWebVideo
    // True while the element has no data for the current position, i.e. playback
    // really cannot continue until the next piece arrives.
    const hasDataAhead = () => {
      const video = playerStore.player
      return Boolean(video && !video.seeking && video.readyState >= 3)
    }
    const isTimeBuffered = () => {
      const video = playerStore.player
      if (!video) return false
      for (let i = 0; i < video.buffered.length; i += 1) {
        if (video.currentTime >= video.buffered.start(i) && video.currentTime < video.buffered.end(i) - 0.05) return true
      }
      return false
    }
    playerStore.player.addEventListener('seeking', () => {
      // A seek inside already buffered data finishes at once - no loading state for it.
      const needsData = !isTimeBuffered()
      if (isCopyStream() && needsData) playerStore.isStreamWaiting = true
      if (playerStore.isWebVideo) {
        if (needsData) playerStore.isStreamWaiting = true
        playerStore.webVideoFrameReady = false
        return
      }
      if (!playerStore.usesLiveTranscode) liveSession.armDirectSeekStallWatch()
    })
    playerStore.player.addEventListener('seeked', () => {
      liveSession.clearDirectSeekStallWatch()
      // Still no data after the seek: keep the loading state until 'canplay'.
      if (hasDataAhead()) playerStore.isStreamWaiting = false
      if (playerStore.isWebVideo) {
        playerStore.webVideoFrameReady = Boolean(playerStore.player && playerStore.player.readyState >= 2)
      }
    })
    const onWebFrameReady = () => {
      if (hasDataAhead()) playerStore.isStreamWaiting = false
      if (!playerStore.isWebVideo) return
      playerStore.webVideoFrameReady = Boolean(playerStore.player && playerStore.player.readyState >= 2 && !playerStore.player.seeking)
    }
    playerStore.player.addEventListener('loadeddata', onWebFrameReady)
    playerStore.player.addEventListener('canplay', onWebFrameReady)
    playerStore.player.addEventListener('pause', () => {
      if (playerStore.isWebVideo && !playerStore.webVideoLoading && !playerStore.playbackError
        && playerStore.player?.paused) playerStore.paused = true
    })
    playerStore.player.addEventListener('waiting', () => {
      // 'waiting' fires only when playback stopped for lack of the next data.
      playerStore.isStreamWaiting = true
      if (playerStore.isWebVideo) return
      if (!playerStore.usesLiveTranscode) {
        // The watchdog only accepts suspect codec/container plans. Normal
        // buffering on slow disks or NAS must not promote a healthy original.
        const currentTime = Number(playerStore.player?.currentTime) || 0
        if (currentTime > 2) {
          liveSession.armDirectSeekStallWatch()
        }
      }
    })
    playerStore.player.addEventListener('canplaythrough', () => {
      if (hasDataAhead()) playerStore.isStreamWaiting = false
    })
    playerStore.player.addEventListener('playing', () => {
      void ensureOpeningThumb()
      liveSession.clearDirectSeekStallWatch()
      playerStore.isStreamWaiting = false
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
    // The hidden <video> mounts and re-binds on its own (ref callback, onMounted); while mpv owns
    // playback that must not replace it, or pause / seek would go to an element nobody sees.
    if (playerStore.nativeEngine && !isNativeElement(el)) return
    if (playerStore.player && playerStore.player !== el) {
      delete playerStore.player.dataset.playerBound
    }
    playerStore.player = el
    initPlayer()
  }

  const ensureVideoElement = async (options: {preferNative?: boolean} = {}) => {
    if (options.preferNative && await isNativePlayerAvailable()) {
      const native = await acquireNativeElement()
      if (native) {
        if (playerStore.player !== native) bindVideoElement(native)
        playerStore.nativeEngine = true
        return native
      }
    }
    if (playerStore.nativeEngine) {
      stopNativePlayback()
      playerStore.nativeEngine = false
      if (videoPlayer.value) bindVideoElement(videoPlayer.value)
    }
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
