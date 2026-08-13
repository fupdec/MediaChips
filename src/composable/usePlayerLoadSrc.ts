import {nextTick} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {usePlayerStore} from '@/stores/player'
import {useSettingsStore} from '@/stores/settings'
import {useDialogsStore} from '@/stores/dialogs'
import {useRegistrationStore} from '@/stores/registration'
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
import {checkFileExists} from '@/services/fileService'
import {setNotification} from '@/services/notificationService'
import {ensureMarkThumb, getMarkImagePath} from '@/utils/markThumb'
import {isIgnorablePlaybackError} from '@/utils/playerBuffer'
import {
  buildLiveStreamUrl,
  buildVideoStreamUrl,
  fetchPlayableInfo,
  UnsupportedPlaybackError,
} from '@/services/transcodeService'
import {markLiveTranscodeSession} from '@/utils/liveTranscodeLifecycle'
import type {MediaItem, PlayerPlaylistItem} from '@/types/stores'
import type {UsePlayerPlaybackOptions} from '@/types/player'
import {
  getSegmentStart,
  isClipPlaylistItem,
  mergeClipFields,
  playlistItemKey,
} from '@/utils/mediaItem'
import {resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
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
  shouldBlockUnregisteredPlaylistDepth,
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
  const registrationStore = useRegistrationStore()
  const itemsStore = useItemsStore()
  const eventBus = useEventBus()
  const {t} = useI18n()

  const getMarks = async (media: MediaItem) => {
    try {
      const res = await typedApi.getMarksForVideo(media.id)
      playerStore.marks = res.data
      if (!media?.id || !appStore.mediaPath) return
      for (const mark of playerStore.marks) {
        if (mark.id == null) continue
        const imgPath = getMarkImagePath(appStore.mediaPath, mark.id)
        if (await checkFileExists(imgPath)) {
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
      if (marks.value?.getThumbs) await marks.value.getThumbs()
    } catch (e) {
      console.error('Failed to load marks:', e)
    }
  }

  const getMetadata = async (media: MediaItem) => {
    const res = await typedApi.getVideoMetadata(media.id)
    playerStore.metadata = res.data
    playerStore.media = media
  }

  const resolveVideoSource = async (
    mediaId: number,
    startTime = 0,
    _options: {accurateStart?: boolean} = {},
  ) => {
    await liveSession.clearLiveTranscodeHandlers()
    const playable = await fetchPlayableInfo(mediaId)
    const playability = playable.playability as {needsRemux?: boolean} | undefined
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

  const loadSrc = async (media: MediaItem, start_time?: number) => {
    const session = ++state.transcodeSessionId
    liveSession.resetTranscodeState()
    state.directPlaybackFallbackAttempted = false
    state.directPlaybackFallbackInFlight = false
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

    await getMetadata(media)
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
      videoEl.src = await resolveVideoSource(media.id, targetStartTime)
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
    if (!playerStore.usesLiveTranscode) {
      if (shouldSeekDirectOnLoadSrc({explicitStart, targetStartTime, segmentStart})) {
        await seekDirectPlaybackTo(videoEl, targetStartTime, () => isLoadSrcStale(session))
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

    await itemsStore.countViewNumber(media, 'media')
    if (isLoadSrcStale(session)) {
      await liveSession.clearLiveTranscodeHandlers()
      return
    }
    updateItemVideo(media.id)
    playerStore.playbackError = false
    dialogsStore.closeMarkAdding()
    if (shouldBlockUnregisteredPlaylistDepth({
      registered: Boolean(registrationStore.reg),
      nowPlaying: playerStore.nowPlaying,
    })) {
      await liveSession.clearLiveTranscodeHandlers()
      videoEl.src = ''
      isReady.value = true
      return
    }
    if (isPlayerWindow.value) updatePlayerWindowTitle(media)
    playerStore.changePlayerStatusText({
      text: `${playerStore.nowPlaying + 1}. ${media.name}`,
      icon: 'format-list-bulleted',
      large: true,
    })
    try {
      if (playerStore.usesLiveTranscode) {
        await liveSession.playCurrentLiveStream()
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
      }
    }
    if (isLoadSrcStale(session)) return
    isReady.value = true
    void getMarks(media)
  }

  const updatePlaybackTime = async (media: MediaItem) => {
    const time = Number(playerStore.currentTime) || 0
    try {
      await typedApi.updateVideoMetadata(media.id, {time})
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
    const mediaTypeId = media.mediaTypeId || getDefaultMediaTypeId(appStore.mediaTypes)
    try {
      const res = await typedApi.getAllMetaInMediaType({mediaTypeId})
      itemsStore.assigned = res.data
    } catch (e) {
      console.log('Error loading metadata:', e)
    }
  }

  return {
    getMarks,
    getMetadata,
    initPlayingVideo,
    loadSrc,
    resolveVideoSource,
    updatePlaybackTime,
  }
}
