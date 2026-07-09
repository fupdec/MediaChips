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
import {isIgnorablePlaybackError} from '@/utils/playerBuffer'
import {
  getChunkStart,
  getNextChunkStart,
  LIVE_STREAM_CHUNK_SECONDS,
  LIVE_STREAM_PREFETCH_SECONDS,
} from '@/utils/liveStreamChunk'
import {
  buildVideoStreamUrl,
  buildLiveStreamUrl,
  fetchPlayableInfo,
  stopLiveTranscode,
  playLiveStreamWhenReady,
  UnsupportedPlaybackError,
} from '@/services/transcodeService'
import {
  markLiveTranscodeSession,
  clearLiveTranscodeSessionMark,
} from '@/utils/liveTranscodeLifecycle'
import type { MediaItem, PlayerPlaylistItem } from '@/types/stores'
import type { ResolvedPlayableVideo, UsePlayerPlaybackOptions } from '@/types/player'

function metadataNumber(metadata: Record<string, unknown>, key: string): number | null {
  const value = Number(metadata[key])
  return Number.isFinite(value) ? value : null
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

  if (playlist.length > 0) {
    const foundIndex = findIndex(playlist, (item) => item.id == initialVideo.id)

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
      ? Math.max(0, findIndex(playlist, (item) => item.id == initialVideo.id))
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

  const initPlayer = () => {
    if (!playerStore.player) return
    if (playerStore.player.dataset.playerBound === '1') return

    playerStore.player.dataset.playerBound = '1'
    isReady.value = false

    playerStore.player.addEventListener('loadedmetadata', () => {
      const videoEl = playerStore.player
      if (!videoEl) return

      const metadataDuration = metadataNumber(playerStore.metadata, 'duration')
      if (playerStore.usesLiveTranscode && metadataDuration != null) {
        playerStore.duration = metadataDuration
      } else if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
        playerStore.duration = videoEl.duration
      } else if (metadataDuration != null) {
        playerStore.duration = metadataDuration
      }

      playerStore.syncPlaybackState()
    })

    playerStore.player.addEventListener('timeupdate', () => {
      playerStore.syncPlaybackState()
      maybeAdvanceLiveStreamChunk()
    })

    playerStore.player.addEventListener('progress', () => {
      playerStore.syncPlaybackState()
    })

    playerStore.player.addEventListener('ended', async () => {
      if (playerStore.usesLiveTranscode) {
        const nextStart = getNextChunkStart(
          playerStore.liveStreamOffset,
          playerStore.duration,
        )
        if (nextStart != null) {
          const advanced = await switchLiveStreamChunk(nextStart)
          if (advanced) return
        }
      }

      if (playerStore.playlistMode.includes('autoplay') && controls.value) {
        controls.value.next?.()
      }
    })

    playerStore.player.addEventListener('error', () => {
      if (!playerStore.active || !playerStore.player?.src) return

      if (isIgnorablePlaybackError({
        usesLiveTranscode: playerStore.usesLiveTranscode,
        isLiveStreamSeeking: playerStore.isLiveStreamSeeking,
        mediaErrorCode: playerStore.player.error?.code,
      })) {
        return
      }

      playerStore.playbackError = true
      if (playerStore.usesLiveTranscode) {
        failTranscode(playerStore.player.error?.message || 'Playback failed')
      }
    })

    playerStore.player.addEventListener('waiting', () => {
      if (!playerStore.usesLiveTranscode) return
      playerStore.isStreamWaiting = true
    })

    playerStore.player.addEventListener('playing', () => {
      if (!playerStore.usesLiveTranscode) return
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

  const resetTranscodeState = () => {
    playerStore.transcodeStatus = 'none'
    playerStore.transcodeError = null
  }

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
      ),
    )
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
    isAdvancingChunk = false
    pendingNextChunkStart = null
    liveStreamSeekGeneration += 1
    seekLiveStream.cancel?.()
    maybeAdvanceLiveStreamChunk.cancel?.()

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
    const nextStart = getNextChunkStart(chunkStart, playerStore.duration)
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

    const chunkStart = getChunkStart(time)
    const seekGeneration = ++liveStreamSeekGeneration
    const wasPaused = playerStore.paused
    isAdvancingChunk = false
    pendingNextChunkStart = null
    playerStore.isLiveStreamSeeking = true
    playerStore.playbackError = false
    playerStore.liveStreamOffset = chunkStart
    playerStore.bufferedRanges = []
    playerStore.player.src = buildLiveStreamUrl(
      buildApiUrl,
      currentLiveMediaId,
      chunkStart,
      playerStore.liveTranscodeMaxHeight,
    )
    playerStore.currentTime = time

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

    playerStore.syncPlaybackState()

    window.setTimeout(() => {
      if (seekGeneration !== liveStreamSeekGeneration) return
      if (!playerStore.isLiveStreamSeeking) return
      playerStore.isLiveStreamSeeking = false
    }, 15000)
  }, 250)

  const resolveVideoSource = async (mediaId: number, startTime = 0) => {
    await clearLiveTranscodeHandlers()

    const playable = await fetchPlayableInfo(mediaId)

    if (playable.mode === 'unsupported') {
      throw new UnsupportedPlaybackError()
    }

    if (!playable.transcodeRequired) {
      resetTranscodeState()
      return buildVideoStreamUrl(buildApiUrl, mediaId, 'auto')
    }

    const chunkStart = getChunkStart(startTime)
    currentLiveMediaId = mediaId
    playerStore.usesLiveTranscode = true
    playerStore.liveTranscodeMediaId = mediaId
    playerStore.liveTranscodeMaxHeight = normalizeTranscodeMaxHeight(settingsStore.transcodeMaxHeight)
    playerStore.transcodeStatus = 'stream'
    playerStore.liveStreamSeekHandler = (time: number) => {
      playerStore.currentTime = time
      seekLiveStream(time)
    }

    playerStore.liveStreamOffset = chunkStart
    resetTranscodeState()
    playerStore.transcodeStatus = 'stream'
    markLiveTranscodeSession(mediaId)
    return buildLiveStreamUrl(buildApiUrl, mediaId, chunkStart, playerStore.liveTranscodeMaxHeight)
  }

  const isLoadSrcStale = (session: number) =>
    isLoadSrcSessionStale(session, transcodeSessionId, playerStore.active)

  const changeLiveTranscodeMaxHeight = async (maxHeight: number | string) => {
    const normalized = String(maxHeight)
    if (!playerStore.usesLiveTranscode || !playerStore.player || !currentLiveMediaId || !playerStore.active) {
      return
    }
    if (normalized === playerStore.liveTranscodeMaxHeight) return

    seekLiveStream.cancel?.()
    maybeAdvanceLiveStreamChunk.cancel?.()

    const seekGeneration = ++liveStreamSeekGeneration
    isAdvancingChunk = false
    pendingNextChunkStart = null
    const time = playerStore.currentTime
    const chunkStart = getChunkStart(time)
    const wasPaused = playerStore.paused

    const liveMediaId = currentLiveMediaId
    if (liveMediaId == null) return

    playerStore.liveTranscodeMaxHeight = normalized
    playerStore.isLiveStreamSeeking = true
    playerStore.playbackError = false
    playerStore.liveStreamOffset = chunkStart
    playerStore.bufferedRanges = []
    playerStore.currentTime = time
    playerStore.player.src = buildLiveStreamUrl(
      buildApiUrl,
      liveMediaId,
      chunkStart,
      normalized,
    )

    try {
      if (!wasPaused) {
        await playLiveStreamWhenReady(
          playerStore.player!,
          () => buildLiveStreamUrl(
            buildApiUrl,
            liveMediaId,
            chunkStart,
            normalized,
          ),
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
        playerStore.isLiveStreamSeeking = false
        playerStore.syncPlaybackState()
      }
    }
  }

  const loadSrc = async (media: MediaItem, start_time?: number) => {
    const session = ++transcodeSessionId
    resetTranscodeState()
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

    media = resolved.video
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
    if (metadataDuration != null) {
      playerStore.duration = metadataDuration
    }

    let targetStartTime = start_time || 0
    if (!start_time && settingsStore.restorePlaybackTime == '1') {
      const metaTime = metadataNumber(playerStore.metadata, 'time')
      if (metaTime != null && metadataDuration != null) {
        if (!(metadataDuration - metaTime < 5)) {
          targetStartTime = metaTime
        }
      }
    }

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

    playerStore.media = media
    await getMarks(media)
    if (isLoadSrcStale(session)) {
      await clearLiveTranscodeHandlers()
      return
    }

    playerStore.trackCurrentTime()
    videoEl.playbackRate = playerStore.speed

    if (!playerStore.usesLiveTranscode) {
      if (start_time) {
        videoEl.currentTime = start_time
      } else if (targetStartTime) {
        videoEl.currentTime = targetStartTime
      }
    } else {
      const chunkStart = getChunkStart(targetStartTime)
      playerStore.liveStreamOffset = chunkStart
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
  }

  const updatePlaybackTime = async (media: MediaItem) => {
    try {
      await typedApi.updateVideoMetadata(media.id, {
        time: playerStore.currentTime,
      })
      updateItemVideo(media.id)
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

    playerStore.playlist = videos.map((item): PlayerPlaylistItem => ({
      ...item,
      key: String(item.id),
      thumb: item.thumb
        ? (item.thumb.startsWith('http') ? item.thumb : buildApiUrl(item.thumb))
        : '/images/unavailable.png',
    }))

    isReady.value = false
    playerStore.playbackError = false
    playerStore.active = true
    updatePlayerWindowTitle(media)

    await nextTick()
    await loadSrc(media, time)

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
