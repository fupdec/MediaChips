import {nextTick} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {usePlayerStore} from '@/stores/player'
import {useSettingsStore} from '@/stores/settings'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import {useEventBus} from '@/utils/eventBus'
import {
  findMediaTypeById,
  getDefaultMediaTypeId,
  isAudioFilePath,
  isAudioMediaType,
} from '@/utils/mediaType'
import {buildApiUrl} from '@/services/apiClient'
import {typedApi} from '@/services/typedApi'
import {buildLocalFileUrl, checkFileExists} from '@/services/fileService'
import {setNotification} from '@/services/notificationService'
import {ensureMarkThumb, getMarkImagePath} from '@/utils/markThumb'
import {isIgnorablePlaybackError} from '@/utils/playerBuffer'
import {hasUnsupportedBrowserAudio} from '@/utils/browserPlaybackSupport'
import {
  buildLiveStreamUrl,
  buildVideoStreamUrl,
  fetchPlayableInfo,
  UnsupportedPlaybackError,
} from '@/services/transcodeService'
import {abortVideoPlayback, markLiveTranscodeSession} from '@/utils/liveTranscodeLifecycle'
import type {MediaItem, PlayerPlaylistItem} from '@/types/stores'
import type {UsePlayerPlaybackOptions} from '@/types/player'
import {
  getSegmentStart,
  isClipPlaylistItem,
  mergeClipFields,
  playlistItemKey,
} from '@/utils/mediaItem'
import {resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import {isDriveMediaPath} from '@shared/cloudDrive'
import {isRemoteMediaPath, isNasMediaPath} from '@shared/remoteMedia'
import {attachWebVideo, disposeWebVideo, prepareWebVideoPlayback} from '@/services/webVideoPlayback'
import {
  isLoadSrcSessionStale,
  metadataNumber,
  normalizeTranscodeMaxHeight,
  parseExplicitPlaybackStart,
  playbackErrorMessage,
  resolvePlaybackStartTime,
  resolvePlayableVideo,
  resolveSemanticPlaybackStart,
  resolveVideoSourcePlan,
  shouldSeekDirectOnLoadSrc,
} from '@/utils/playerPlaybackResolve'
import {
  createPlayerLiveSession,
  seekDirectPlaybackTo,
  type PlayerPlaybackSharedState,
} from '@/composable/usePlayerLiveSession'

type PlayerLiveSession = ReturnType<typeof createPlayerLiveSession>

interface PlayerLoadSrcOptions extends Pick<
  UsePlayerPlaybackOptions,
  'isReady' | 'marks' | 'isPlayerWindow' | 'updateItemVideo' | 'updatePlayerWindowTitle'
> {
  state: PlayerPlaybackSharedState
  liveSession: PlayerLiveSession
  ensureVideoElement: () => Promise<HTMLVideoElement | null>
}

export function createPlayerLoadSrc({
  state,
  liveSession,
  isReady,
  marks,
  isPlayerWindow,
  updateItemVideo,
  updatePlayerWindowTitle,
  ensureVideoElement,
}: PlayerLoadSrcOptions) {
  const appStore = useAppStore()
  const playerStore = usePlayerStore()
  const settingsStore = useSettingsStore()
  const dialogsStore = useDialogsStore()
  const itemsStore = useItemsStore()
  const eventBus = useEventBus()
  const {t} = useI18n()
  let remoteLoadController: AbortController | null = null

  const disposeRemoteLoad = () => {
    remoteLoadController?.abort()
    remoteLoadController = null
    playerStore.cancelRemoteLoadHandler = null
    playerStore.resumeRemoteLoadHandler = null
  }

  const getMarks = async (media: MediaItem) => {
    const session = state.transcodeSessionId
    const isStale = () => isLoadSrcStale(session) || playerStore.media?.id !== media.id
    if (media.id <= 0) { playerStore.marks = []; return }
    try {
      const res = await typedApi.getMarksForVideo(media.id)
      if (isStale()) return
      playerStore.marks = res.data
      if (isRemoteMediaPath(media.path)) return
      if (!media?.id || !appStore.mediaPath) return
      for (const mark of res.data) {
        if (isStale()) return
        if (mark.id == null) continue
        const imgPath = getMarkImagePath(appStore.mediaPath, mark.id)
        const exists = await checkFileExists(imgPath)
        if (isStale()) return
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
            onUpdated: (markId: number | string) => { if (!isStale()) eventBus.emit('updateMarkImage', markId) },
          })
        } catch (e) {
          console.error('Failed to create mark thumb:', e)
        }
      }
      if (isStale()) return
      eventBus.emit('refreshMarkThumbs')
      if (marks.value?.getThumbs) await marks.value.getThumbs()
    } catch (e) {
      console.error('Failed to load marks:', e)
    }
  }

  const getMetadata = async (media: MediaItem, isStale = () => false) => {
    if (media.id <= 0) {
      const samePath = playerStore.media?.path === media.path
      if (!samePath) playerStore.metadata = {}
      playerStore.media = media
      playerStore.duration = metadataNumber(playerStore.metadata, 'duration') || media.duration || 1
      return
    }
    const res = await typedApi.getVideoMetadata(media.id)
    if (isStale()) return
    playerStore.metadata = res.data
    playerStore.media = media
  }

  const resolveVideoSource = async (
    mediaId: number,
    startTime = 0,
    _options: {accurateStart?: boolean} = {},
  ) => {
    await liveSession.clearLiveTranscodeHandlers()
    const playable = await fetchPlayableInfo(mediaId).catch(() => ({mode: 'direct'} as Awaited<ReturnType<typeof fetchPlayableInfo>>))
    const playability = playable.playability as {playable?: boolean; needsRemux?: boolean; audioCodec?: string | null} | undefined
    state.directPlaybackFallbackCandidate = playability?.playable === false
      || playable.reason === 'container_layout' || playability?.needsRemux === true
    const plan = resolveVideoSourcePlan({
      playableMode: playable.mode || 'unsupported',
      transcodeRequired: Boolean(playable.transcodeRequired),
      remuxCopy: playable.remuxCopy,
      reason: playable.reason,
      needsRemux: playability?.needsRemux === true,
      startTime,
      forceDirectPlayback: state.forceDirectPlayback,
      liveTranscodeDisabled: playerStore.liveTranscodeDisabled,
      transcodeUnsupportedFormatsEnabled: settingsStore.transcodeUnsupportedFormats === '1',
      audioUnsupported: Boolean(playerStore.player && hasUnsupportedBrowserAudio(playerStore.player, playability?.audioCodec)),
    })
    if (plan.kind === 'unsupported') throw new UnsupportedPlaybackError()
    playerStore.liveTranscodeOfferable = plan.liveTranscodeOfferable
    if (plan.kind === 'direct') {
      liveSession.resetTranscodeState()
      playerStore.usesLiveTranscode = false
      playerStore.liveTranscodeStarted = false
      playerStore.isLiveStreamSeeking = false
      playerStore.isStreamWaiting = false
      playerStore.clearBackgroundStatus()
      state.liveStreamAccurateSeek = false
      if (plan.lockForcedDirect) {
        playerStore.liveTranscodeDisabled = true
        playerStore.liveTranscodeOfferable = true
        state.forceDirectPlayback = true
      }
      return buildVideoStreamUrl(buildApiUrl, mediaId, plan.streamMode)
    }
    state.currentLiveMediaId = mediaId
    state.liveStreamCopyCompatible = plan.copyCompatible
    state.liveStreamAccurateSeek = false
    playerStore.usesLiveTranscode = true
    playerStore.liveTranscodeDisabled = false
    playerStore.liveTranscodeOfferable = true
    playerStore.liveTranscodeMediaId = mediaId
    playerStore.liveTranscodeMaxHeight = normalizeTranscodeMaxHeight(settingsStore.transcodeMaxHeight)
    playerStore.transcodeStatus = 'stream'
    playerStore.liveStreamSeekHandler = (time: number) => {
      playerStore.currentTime = time
      liveSession.seekLiveStream(time)
    }
    playerStore.liveStreamOffset = plan.streamStart
    liveSession.resetTranscodeState()
    playerStore.transcodeStatus = 'stream'
    markLiveTranscodeSession(mediaId)
    return buildLiveStreamUrl(
      buildApiUrl,
      mediaId,
      plan.streamStart,
      playerStore.liveTranscodeMaxHeight,
      liveSession.liveStreamUrlOptions(),
    )
  }

  const isLoadSrcStale = (session: number) => isLoadSrcSessionStale(
    session,
    state.transcodeSessionId,
    playerStore.active,
  )

  const loadSrc = async (media: MediaItem, start_time?: number, options: {
    webQuality?: number | null; webFresh?: boolean; preservePlayback?: boolean; paused?: boolean
  } = {}) => {
    const session = ++state.transcodeSessionId
    disposeRemoteLoad()
    const remoteController = new AbortController()
    remoteLoadController = remoteController
    if (isRemoteMediaPath(media.path)) {
      playerStore.cancelRemoteLoadHandler = () => {
        if (isLoadSrcStale(session)) return
        ++state.transcodeSessionId
        disposeRemoteLoad()
        disposeWebVideo(playerStore.player)
        abortVideoPlayback(playerStore.player)
        clearInterval(playerStore.currentTimeTimeout)
        playerStore.webVideoLoading = false
        playerStore.webVideoFrameReady = false
        playerStore.paused = true
        playerStore.currentTime = 0
        playerStore.bufferedRanges = []
        playerStore.isStreamWaiting = false
        playerStore.playbackError = false
        isReady.value = true
        playerStore.resumeRemoteLoadHandler = () => {
          void loadSrc(media, 0, {...options, paused: false})
        }
      }
    }
    clearInterval(playerStore.currentTimeTimeout)
    playerStore.webVideoLoading = isRemoteMediaPath(media.path)
    playerStore.webVideoFrameReady = false
    playerStore.paused = Boolean(options.paused)
    playerStore.bufferedRanges = []
    playerStore.isStreamWaiting = false
    if (!options.preservePlayback) playerStore.marks = []
    if (!options.preservePlayback) {
      playerStore.webVideoQualities = []
      playerStore.webVideoQuality = null
      playerStore.webVideoAdaptive = false
    }
    try {
      disposeWebVideo(playerStore.player)
      if (playerStore.player && (isRemoteMediaPath(media.path) || isRemoteMediaPath(playerStore.media?.path))) {
        playerStore.player.pause()
        playerStore.player.removeAttribute('src')
        playerStore.player.load()
      }
      liveSession.resetTranscodeState()
      state.directPlaybackFallbackAttempted = false
      state.directPlaybackFallbackInFlight = false
      state.directPlaybackFallbackCandidate = false
      state.liveStreamCopyCompatible = false
      state.liveStreamAccurateSeek = false
      state.forceDirectPlayback = false
      playerStore.liveTranscodeDisabled = false
      playerStore.liveTranscodeOfferable = false
      liveSession.clearDirectSeekStallWatch()
      await liveSession.clearLiveTranscodeHandlers()
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
      const explicitStart = parseExplicitPlaybackStart(start_time)
      media = mergeClipFields(resolved.video, requestedMedia)
      const mediaType = findMediaTypeById(appStore.mediaTypes, media.mediaTypeId)
      playerStore.isAudioMode = isAudioMediaType(mediaType) || isAudioFilePath(media.path)
      playerStore.is_file_exists = media.path ? await checkFileExists(media.path) : false
      if (isLoadSrcStale(session)) return
      if (playerStore.playlist.length > 0) playerStore.nowPlaying = resolved.index

      await getMetadata(media, () => isLoadSrcStale(session))
      if (isLoadSrcStale(session)) return
      const metadataDuration = metadataNumber(playerStore.metadata, 'duration')
      if (metadataDuration != null && metadataDuration > 0) {
        playerStore.duration = metadataDuration
      }
      const playingClip = requestedClip || isClipPlaylistItem(media)
      const segmentStart = getSegmentStart(media) ?? requestedSegmentStart
      const semanticTileIndex = Number(
        (media as MediaItem).semanticTileIndex
        ?? (requestedMedia as MediaItem).semanticTileIndex,
      )
      const hasSemanticTile = Number.isFinite(semanticTileIndex) && semanticTileIndex >= 0
      // Seek-only (Find scene / mix): recompute from tile + clamp to real duration.
      // Ranged marker clips keep the normal start/end path.
      const semanticStart = (!playingClip && (hasSemanticTile || segmentStart != null))
        ? resolveSemanticPlaybackStart({
          explicitStart,
          segmentStart,
          semanticTileIndex: hasSemanticTile ? semanticTileIndex : null,
          durationSec: (() => {
            if (metadataDuration != null && metadataDuration > 0) return metadataDuration
            const fromMedia = Number(media.duration)
            return Number.isFinite(fromMedia) && fromMedia > 0 ? fromMedia : null
          })(),
        })
        : undefined
      const targetStartTime = semanticStart != null
        ? semanticStart
        : resolvePlaybackStartTime({
          explicitStart,
          segmentStart,
          playingClip,
          restorePlaybackTime: settingsStore.restorePlaybackTime == '1',
          metaTime: metadataNumber(playerStore.metadata, 'time'),
          metadataDuration,
        })
      playerStore.media = media
      playerStore.currentTime = targetStartTime

      try {
        if (isRemoteMediaPath(media.path)) {
          videoEl.autoplay = !options.paused
          const source = await prepareWebVideoPlayback(media.id, {quality: options.webQuality, fresh: options.webFresh,
            signal: remoteController?.signal, path: media.path})
          if (isLoadSrcStale(session)) return
          playerStore.webVideoQualities = source.qualities
          playerStore.webVideoQuality = source.quality
          playerStore.webVideoAdaptive = source.adaptive
          playerStore.usesLiveTranscode = false
          playerStore.liveStreamOffset = 0
          await attachWebVideo(videoEl, source, () => isLoadSrcStale(session), (message) => {
            if (isLoadSrcStale(session)) return
            playerStore.transcodeError = message
            playerStore.playbackError = true
            isReady.value = true
          }, targetStartTime)
        } else {
          videoEl.removeAttribute('crossorigin')
          const source = media.id === 0
            ? buildLocalFileUrl(media.path || '', true)
            : await resolveVideoSource(media.id, targetStartTime)
          if (isLoadSrcStale(session)) return
          videoEl.src = source
          if (media.id > 0 && !playerStore.usesLiveTranscode) liveSession.armDirectSeekStallWatch()
        }
      } catch (error) {
        if (isLoadSrcStale(session)) return
        console.error('Player: Failed to prepare video source:', error)
        await liveSession.clearLiveTranscodeHandlers()
        liveSession.resetTranscodeState()
        if (error instanceof UnsupportedPlaybackError) {
          playerStore.playbackError = true
        } else {
          liveSession.failTranscode(playbackErrorMessage(error, 'Failed to prepare video source'))
        }
        isReady.value = true
        return
      }
      if (isLoadSrcStale(session)) {
        await liveSession.clearLiveTranscodeHandlers()
        return
      }

      playerStore.trackCurrentTime()
      videoEl.playbackRate = playerStore.speed
      videoEl.volume = playerStore.volume
      videoEl.muted = playerStore.muted
      if (!playerStore.usesLiveTranscode) {
        if (shouldSeekDirectOnLoadSrc({explicitStart, targetStartTime, segmentStart})) {
          await seekDirectPlaybackTo(videoEl, targetStartTime, () => isLoadSrcStale(session), remoteController.signal)
          if (isLoadSrcStale(session)) {
            await liveSession.clearLiveTranscodeHandlers()
            return
          }
          playerStore.currentTime = targetStartTime
        }
      } else {
        playerStore.liveStreamOffset = targetStartTime
        playerStore.currentTime = targetStartTime
        playerStore.bufferedRanges = []
      }

      if (!options.preservePlayback && media.id > 0) await itemsStore.countViewNumber(media, 'media')
      if (isLoadSrcStale(session)) {
        await liveSession.clearLiveTranscodeHandlers()
        return
      }
      if (media.id > 0) updateItemVideo(media.id)
      if (playerStore.playbackError) { isReady.value = true; return }
      if (!options.preservePlayback) dialogsStore.closeMarkAdding()
      if (isPlayerWindow.value) updatePlayerWindowTitle(media)
      playerStore.changePlayerStatusText({
        text: `${playerStore.nowPlaying + 1}. ${media.name}`,
        icon: 'format-list-bulleted',
        large: true,
      })
      try {
        if (options.paused) {
          videoEl.pause()
        } else if (playerStore.usesLiveTranscode) {
          await liveSession.playCurrentLiveStream(true)
          if (isLoadSrcStale(session)) return
          playerStore.currentTime = targetStartTime
          playerStore.syncPlaybackState()
        } else {
          await videoEl.play()
        }
        if (isLoadSrcStale(session)) return
        playerStore.paused = Boolean(options.paused)
      } catch (e) {
        if (isLoadSrcStale(session)) return
        if (
          !playerStore.usesLiveTranscode
          || !isIgnorablePlaybackError({
            usesLiveTranscode: playerStore.usesLiveTranscode,
            isLiveStreamSeeking: playerStore.isLiveStreamSeeking,
            mediaErrorCode: videoEl.error?.code,
          })
        ) {
          if (playerStore.usesLiveTranscode) {
            liveSession.failTranscode(playbackErrorMessage(e, 'Live transcode playback failed'))
          }
          console.log(e)
          if (isRemoteMediaPath(media.path) && (e as {name?: string})?.name !== 'NotAllowedError') {
            playerStore.playbackError = true
            playerStore.transcodeError = t(isDriveMediaPath(media.path) ? 'drive.playback_error' : isNasMediaPath(media.path) ? 'nas.playback_error' : 'media.adding.web_video_playback_error')
            playerStore.paused = Boolean(options.paused)
          } else playerStore.paused = true
        }
      }
      if (isLoadSrcStale(session)) return
      isReady.value = true
      if (!options.preservePlayback) void getMarks(media)
    } catch (error) {
      if (isLoadSrcStale(session)) return
      playerStore.playbackError = true
      playerStore.transcodeError = playbackErrorMessage(error, t(isDriveMediaPath(media.path) ? 'drive.playback_error' : isNasMediaPath(media.path) ? 'nas.playback_error' : 'media.adding.web_video_playback_error'))
      isReady.value = true
    } finally {
      if (!isLoadSrcStale(session)) {
        disposeRemoteLoad()
        playerStore.webVideoLoading = false
        playerStore.webVideoFrameReady = !playerStore.playbackError && Boolean(playerStore.player
          && playerStore.player.readyState >= 2 && !playerStore.player.seeking)
      }
    }
  }

  const reloadWebVideo = async (options: {quality?: number | null; fresh?: boolean} = {}) => {
    const media = playerStore.media
    if (!media || !isRemoteMediaPath(media.path) || playerStore.webVideoLoading) return
    const time = playerStore.currentTime
    const paused = playerStore.paused
    await loadSrc(media, time, {webQuality: options.quality === undefined ? playerStore.webVideoQuality : options.quality,
      webFresh: options.fresh, preservePlayback: true, paused})
  }

  const positionWrites = new Map<number, Promise<boolean>>()
  const updatePlaybackTime = async (media: MediaItem, position = playerStore.currentTime): Promise<boolean> => {
    if (media.id <= 0) return false
    const time = Number(position)
    if (!Number.isFinite(time) || time < 0) return false
    // Serialize checkpoints and the final close write for each media item.
    const write = (positionWrites.get(media.id) || Promise.resolve()).then(async () => {
      try {
        await typedApi.updateVideoMetadata(media.id, {time})
        updateItemVideo(media.id, {time})
        return true
      } catch (error) {
        console.warn('Failed to save playback time:', error)
        return false
      }
    })
    positionWrites.set(media.id, write)
    const saved = await write
    if (positionWrites.get(media.id) === write) positionWrites.delete(media.id)
    return saved
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
    if (media.id <= 0) {
      playerStore.metadata = {}
      playerStore.marks = []
      playerStore.marksVisible = false
      playerStore.studioMode = false
      playerStore.trimMode = false
      playerStore.selectedMarkId = null
    }
    playerStore.playlist = videos.map((item, index): PlayerPlaylistItem => {
      let thumb = item.thumb
        ? (item.thumb.startsWith('http') ? item.thumb : buildApiUrl(item.thumb))
        : ''
      if (!thumb || thumb === '/images/unavailable.png') {
        const mediaType = findMediaTypeById(appStore.mediaTypes, item.mediaTypeId)
        if (isAudioMediaType(mediaType) || isAudioFilePath(item.path)) {
          thumb = resolveMediaThumbDisplayUrl(appStore.mediaPath, 'audios', item.id)
            || '/images/unavailable.png'
        } else {
          thumb = '/images/unavailable.png'
        }
      }
      return {
        ...item,
        key: playlistItemKey(item, index),
        thumb,
      }
    })
    isReady.value = false
    playerStore.playbackError = false
    playerStore.active = true
    updatePlayerWindowTitle(media)
    await nextTick()
    const startTime = time != null && Number.isFinite(Number(time))
      ? Number(time)
      : getSegmentStart(media)
    await loadSrc(media, startTime)
    if (media.id <= 0) return
    const mediaTypeId = media.mediaTypeId || getDefaultMediaTypeId(appStore.mediaTypes)
    try {
      const res = await typedApi.getAllMetaInMediaType({mediaTypeId})
      itemsStore.assigned = res.data
    } catch (e) {
      console.log('Error loading metadata:', e)
    }
  }

  return {
    disposeRemoteLoad,
    getMarks,
    getMetadata,
    initPlayingVideo,
    loadSrc,
    reloadWebVideo,
    resolveVideoSource,
    updatePlaybackTime,
  }
}
