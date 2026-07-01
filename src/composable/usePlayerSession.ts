import {ref, computed, onMounted, onBeforeUnmount, watch, nextTick, type InjectionKey} from 'vue'
import type { Handler } from 'mitt'
import {useI18n} from 'vue-i18n'
import { debounce } from '@/utils/debounce'
import path from 'path-browserify'
import { buildApiUrl } from '@/services/apiClient'
import { typedApi } from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {usePlayerStore} from '@/stores/player'
import {useDialogsStore} from '@/stores/dialogs'
import {useRegistrationStore} from '@/stores/registration'
import {useSettingsStore} from '@/stores/settings'
import {useEventBus} from '@/utils/eventBus'
import {buildMarkPayload} from '@/utils/markAdding'
import {isWinElectronUi} from '@/utils/electronUi'
import {usePlayerHotkeys} from '@/composable/usePlayerHotkeys'
import {usePlayerWindowBridge} from '@/composable/usePlayerWindowBridge'
import {usePlayerPlayback} from '@/composable/usePlayerPlayback'
import {handlePlayerVideoWheel} from '@/utils/playerHotkeys'
import {getTranscodePlayerStatus} from '@/utils/playerTranscodeStatus'
import {setNotification} from '@/services/notificationService'
import {openPath as openFilePath} from '@/services/shellService'
import {
  abortVideoPlayback,
  cleanupOrphanedLiveTranscode,
  getMarkedLiveTranscodeMediaId,
  installLiveTranscodeUnloadGuard,
} from '@/utils/liveTranscodeLifecycle'
import type { MediaItem } from '@/types/stores'
import type { PlayVideoSwitch, PlayerControlsRef, PlayerMark, PlayerMarksComponentRef } from '@/types/player'

export function usePlayerSession() {
  const appStore = useAppStore()
  const playerStore = usePlayerStore()
  const dialogsStore = useDialogsStore()
  const registrationStore = useRegistrationStore()
  const settingsStore = useSettingsStore()
  const eventBus = useEventBus()
  const {t} = useI18n()

  const {
    isPlayerWindow,
    updateItemVideo,
    updatePlayerWindowTitle,
    resetPlayerWindowTitle,
    exitElectronFullscreenIfNeeded,
    attach: attachPlayerWindowBridge,
    detach: detachPlayerWindowBridge,
  } = usePlayerWindowBridge({
    onInvalidPlayData: () => {
      setNotification({
        type: 'error',
        title: t('player.error_title'),
        text: t('player.invalid_video_data'),
      })
    },
  })

  const isReady = ref<boolean | null>(null)
  const videoPlayer = ref<HTMLVideoElement | null>(null)
  const controls = ref<PlayerControlsRef | null>(null)
  const marks = ref<PlayerMarksComponentRef | null>(null)
  const timeoutControls = ref<ReturnType<typeof setTimeout> | number>(-1)

  const {
    bindVideoElement,
    getMarks,
    loadSrc,
    updatePlaybackTime,
    clearLiveTranscodeHandlers,
    changeLiveTranscodeMaxHeight,
    initPlayingVideo,
  } = usePlayerPlayback({
    isReady,
    videoPlayer,
    controls,
    marks,
    isPlayerWindow,
    updateItemVideo,
    updatePlayerWindowTitle,
  })

  const player = computed(() => playerStore)
  const isActive = computed(() => isPlayerWindow.value || playerStore.active)
  const playerDialogClass = computed(() => {
    if (!isPlayerWindow.value) return 'dialog-player'
    return isWinElectronUi() ? 'player-standalone--win' : ''
  })
  const reg = computed(() => registrationStore.reg)
  const video = computed(() => playerStore.playlist[playerStore.nowPlaying])
  const currentPlaying = computed(() => video.value ? video.value.name : '')
  const isAudioMode = computed(() => playerStore.isAudioMode)
  const audioThumb = computed(() => video.value?.thumb || '/images/unavailable.png')
  const fileExtension = computed(() => {
    if (!video.value?.path) return ''
    const ext = path.extname(video.value.path)
    return ext ? ext.slice(1).toUpperCase() : ''
  })
  const formatErrorMessage = computed(() => {
    if (playerStore.transcodeError) {
      return `${t('player.transcode_error')}: ${playerStore.transcodeError}`
    }

    const transcodeEnabled = settingsStore.transcodeUnsupportedFormats === '1'

    if (transcodeEnabled && playerStore.usesLiveTranscode) {
      return isAudioMode.value
        ? t('player.audio_playback_failed')
        : t('player.video_playback_failed')
    }

    return isAudioMode.value
      ? t('player.audio_format_not_supported')
      : t('player.video_format_not_supported')
  })
  const showPlaybackError = computed(() =>
    playerStore.active && isReady.value && playerStore.playbackError
  )

  const syncTranscodeBackgroundStatus = () => {
    if (!playerStore.active || playerStore.playbackError) {
      playerStore.clearBackgroundStatus()
      return
    }

    const status = getTranscodePlayerStatus(playerStore, t)
    if (status) {
      playerStore.setBackgroundStatus(status)
    } else {
      playerStore.clearBackgroundStatus()
    }
  }

  watch(
    () => [
      playerStore.active,
      playerStore.playbackError,
      playerStore.usesLiveTranscode,
      playerStore.liveTranscodeStarted,
      playerStore.isLiveStreamSeeking,
      playerStore.isStreamWaiting,
      playerStore.transcodeStatus,
      playerStore.transcodeError,
    ],
    syncTranscodeBackgroundStatus,
    {immediate: true},
  )

  const closePlayer = async () => {
    if (video.value) {
      await updatePlaybackTime(video.value)
    }

    await clearLiveTranscodeHandlers()

    playerStore.active = false
    playerStore.playbackError = false
    playerStore.transcodeStatus = 'none'
    playerStore.transcodeError = null
    playerStore.usesLiveTranscode = false
    playerStore.liveTranscodeStarted = false
    playerStore.liveTranscodeMediaId = null
    playerStore.liveTranscodeMaxHeight = '1080'
    playerStore.liveStreamSeekHandler = null
    playerStore.liveStreamOffset = 0
    playerStore.bufferedRanges = []
    playerStore.isLiveStreamSeeking = false
    playerStore.isStreamWaiting = false
    playerStore.clearBackgroundStatus()
    isReady.value = false

    if (playerStore.player) {
      playerStore.player.pause()
      playerStore.player.src = ''
    }

    clearInterval(playerStore.currentTimeTimeout)
    playerStore.currentTime = 0
    playerStore.isAudioMode = false
    playerStore.paused = false
    detachHotkeys()

    resetPlayerWindowTitle()
  }

  const playerWrapperProps = computed(() => {
    if (isPlayerWindow.value) {
      return {
        class: ['player-standalone', playerDialogClass.value].filter(Boolean),
      }
    }

    return {
      'onUpdate:modelValue': closePlayer,
      modelValue: isActive.value,
      persistent: false,
      contentClass: playerDialogClass.value,
      width: 2000,
      noClickAnimation: true,
      eager: true,
    }
  })

  const {attach: attachHotkeys, detach: detachHotkeys} = usePlayerHotkeys(() => ({
    playerStore,
    controls: controls.value,
    togglePause,
    toggleFullscreen,
    changeVolume,
    openAddingMark,
    closePlayer,
  }))

  const openPath = () => {
    if (!video.value?.path) return
    openFilePath(video.value.path, false)
  }

  const stopSmoothScroll = (event: MouseEvent) => {
    if (event.button != 1) return
    event.preventDefault()
    event.stopPropagation()
  }

  const showControls = () => {
    playerStore.isControlsVisible = true
    clearTimeout(timeoutControls.value)
  }

  const toggleFullscreen = async () => {
    showControls()
    controls.value?.resize?.()

    if (playerStore.fullscreen) {
      try {
        screen.orientation.unlock()
        await document.exitFullscreen()
      } catch (e) {
        exitElectronFullscreenIfNeeded()
        console.log(e)
      }
    } else {
      document.getElementById('player')?.requestFullscreen()
      if (!playerStore.isAudioMode && screen.orientation?.lock) {
        screen.orientation.lock('landscape').catch(() => {})
      }
    }
    playerStore.fullscreen = !playerStore.fullscreen
  }

  const togglePictureInPicture = async () => {
    showControls()
    if (playerStore.fullscreen) {
      await document.exitFullscreen()
      playerStore.fullscreen = false
    }

    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture()
    } else if (document.pictureInPictureEnabled && playerStore.player) {
      playerStore.player.requestPictureInPicture()
    }
  }

  const changeVolume = (e: WheelEvent | { volume?: number; deltaY?: number }) => {
    if (!playerStore.player) return

    let volume: number
    if (e.deltaY !== undefined) {
      volume = Number((playerStore.player.volume + e.deltaY / 1000 / 2).toFixed(2))
    } else if ('volume' in e && e.volume !== undefined) {
      volume = e.volume
    } else {
      return
    }

    if (volume < 0) volume = 0
    if (volume > 1) volume = 1

    playerStore.player.volume = volume
    playerStore.volume = volume

    playerStore.changePlayerStatusText({
      text: (volume * 100).toFixed() + ' %',
      icon: 'volume-high',
    })
  }

  const onVideoWheel = (event: WheelEvent) => {
    if (!playerStore.active) return
    handlePlayerVideoWheel(event, {
      controls: controls.value,
      changeVolume,
    })
  }

  const clickOnVideo = (e: MouseEvent) => {
    switch (e.button) {
      case 3:
        controls.value?.prev?.()
        break
      case 4:
        controls.value?.next?.()
        break
    }
  }

  const playVideoObject = async (videos: PlayVideoSwitch) => {
    const {n, o} = videos
    if (o) {
      await updatePlaybackTime(o)
    }
    await loadSrc(n)
  }

  const togglePause = () => {
    controls.value?.togglePause?.()
  }

  const moveOverPlayer = debounce((e) => {
    if (!playerStore.active) return
    if (!e.movementX && !e.movementY) return
    showControls()
    if (!playerStore.fullscreen || playerStore.mouseOverControls) return
    if (playerStore.paused) return

    timeoutControls.value = window.setTimeout(() => {
      playerStore.isControlsVisible = false
    }, 3000)
  }, 5)

  const openAddingMark = (type?: string) => {
    dialogsStore.openMarkAdding({
      time: playerStore.currentTime,
      type: type || 'favorite',
    })
  }

  const addTagToMedia = async (tagId: number | string, metaId?: number | string) => {
    if (!video.value?.id) return

    const response = await typedApi.createTagsInMediaOne({
      mediaId: video.value.id,
      tagId,
      metaId: metaId ?? appStore.getTagById(Number(tagId))?.metaId,
    })

    if (response.data?.[1]) {
      setNotification({
        title: t('player.tag_added_to_video'),
        type: 'success',
        icon: 'tag',
      })
    }

    updateItemVideo(video.value.id)
  }

  const addMark = async (data: Record<string, unknown> = {}) => {
    if (!video.value?.id) return

    const adding = dialogsStore.markAdding
    dialogsStore.setMarkAddingSubmitting(true)

    const mark = buildMarkPayload({
      adding,
      data,
      mediaId: video.value.id,
    }) as {
      type: string
      time: number
      end: number | null
      mediaId: number
      tagId?: number | string
    }

    try {
      await typedApi.createMark(mark)

      if (mark.tagId) {
        await addTagToMedia(mark.tagId, Number(adding.meta?.id) || undefined)
      }

      playerStore.changePlayerStatusText({
        text: t('player.mark_added'),
        icon: 'tooltip-plus',
      })

      await getMarks(video.value)
      dialogsStore.closeMarkAdding()
    } catch (e: unknown) {
      console.error(e)
      const err = e as { response?: { data?: { message?: string } }; message?: string }
      setNotification({
        type: 'error',
        title: t('player.mark_dialog.add_failed'),
        text: err?.response?.data?.message || err?.message,
      })
    } finally {
      dialogsStore.setMarkAddingSubmitting(false)
    }
  }

  const removeMark = async (mark: PlayerMark) => {
    if (!mark.id) return
    try {
      await typedApi.deleteMark(mark.id)
      await getMarks(video.value)
    } catch (e) {
      console.log(e)
    }
  }

  const nextVideo = () => {
    controls.value?.next?.()
  }

  const handlePlayVideoEvent: Handler = (event) => {
    const payload = event as {
      video?: MediaItem
      videos?: MediaItem[]
      time?: number
    }
    if (payload?.video) {
      const {video: media, videos, time} = payload
      initPlayingVideo(media, videos ?? [], time)
    }
  }

  const exitHandler = () => {
    const legacyDoc = document as Document & {
      webkitIsFullScreen?: boolean
      mozFullScreen?: boolean
      msFullscreenElement?: Element | null
    }
    if (!legacyDoc.webkitIsFullScreen && !legacyDoc.mozFullScreen && !legacyDoc.msFullscreenElement) {
      playerStore.fullscreen = false
    }
  }

  let removeLiveTranscodeUnloadGuard: (() => void) | null = null

  onMounted(async () => {
    await cleanupOrphanedLiveTranscode({
      buildStopUrl: (mediaId: number | string) => buildApiUrl(`/api/video/${mediaId}/transcode/stream`),
      stopAllUrl: buildApiUrl('/api/transcode/streams'),
    })

    removeLiveTranscodeUnloadGuard = installLiveTranscodeUnloadGuard({
      getMediaId: () => playerStore.liveTranscodeMediaId || getMarkedLiveTranscodeMediaId(),
      buildStopUrl: (mediaId: number | string) => buildApiUrl(`/api/video/${mediaId}/transcode/stream`),
      stopAllUrl: buildApiUrl('/api/transcode/streams'),
      abortPlayback: () => abortVideoPlayback(playerStore.player),
    })

    await nextTick()
    bindVideoElement(videoPlayer.value)

    eventBus.on('playVideo', handlePlayVideoEvent)

    attachPlayerWindowBridge({
      onPlayVideo: initPlayingVideo,
      onStopPlaying: closePlayer,
    })

    if (document.addEventListener) {
      document.addEventListener('fullscreenchange', exitHandler, false)
      document.addEventListener('mozfullscreenchange', exitHandler, false)
      document.addEventListener('MSFullscreenChange', exitHandler, false)
      document.addEventListener('webkitfullscreenchange', exitHandler, false)
    }
  })

  onBeforeUnmount(() => {
    removeLiveTranscodeUnloadGuard?.()
    removeLiveTranscodeUnloadGuard = null
    eventBus.off('playVideo', handlePlayVideoEvent)
    detachPlayerWindowBridge()
    clearTimeout(timeoutControls.value)
    document.removeEventListener('fullscreenchange', exitHandler)
    document.removeEventListener('mozfullscreenchange', exitHandler)
    document.removeEventListener('MSFullscreenChange', exitHandler)
    document.removeEventListener('webkitfullscreenchange', exitHandler)
  })

  watch(() => playerStore.active, (active) => {
    if (active) attachHotkeys()
    else detachHotkeys()
  }, {immediate: true})

  watch(() => playerStore.volume, (newValue, oldValue) => {
    if (newValue !== oldValue && playerStore.player) {
      playerStore.player.volume = newValue
    }
  })

  return {
    player,
    playerStore,
    dialogsStore,
    isPlayerWindow,
    isActive,
    playerWrapperProps,
    reg,
    videoPlayer,
    bindVideoElement,
    controls,
    marks,
    currentPlaying,
    isAudioMode,
    audioThumb,
    fileExtension,
    formatErrorMessage,
    showPlaybackError,
    closePlayer,
    changeLiveTranscodeMaxHeight,
    stopSmoothScroll,
    moveOverPlayer,
    togglePause,
    toggleFullscreen,
    togglePictureInPicture,
    onVideoWheel,
    clickOnVideo,
    playVideoObject,
    changeVolume,
    showControls,
    openAddingMark,
    addMark,
    removeMark,
    openPath,
    nextVideo,
    updateItemVideo,
  }
}

export type PlayerSessionContext = ReturnType<typeof usePlayerSession>

export const PLAYER_SESSION_KEY: InjectionKey<PlayerSessionContext> = Symbol('playerSession')
