import {ref, computed, watch, inject} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute} from 'vue-router'
import {useDisplay} from 'vuetify'
import path from 'path-browserify'
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {usePlayerStore} from '@/stores/player'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import {useEventBus} from '@/utils/eventBus'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {isStandalonePlayerRoute} from '@/utils/playerWindow'
import {createThumb} from '@/services/fileService'
import {getReadableDuration} from '@/services/formatUtils'
import {setNotification} from '@/services/notificationService'
import {
  getVolumeDeltaFromWheel,
  preventWheelDefault,
} from '@/utils/playerWheel'
import {
  isPlaylistNavDisabled,
  resolvePlaylistIndex,
} from '@/composable/usePlayerTransportPlayback'
import {PLAYER_SESSION_KEY, type PlayerSessionContext} from '@/composable/usePlayerSession'
import type { MediaItem } from '@/types/stores'
import type { PlayerMark, PlayVideoSwitch } from '@/types/player'

interface VideoEditComponentRef {
  save?: () => Promise<void>
}

interface UsePlayerTransportOptions {
  emit: {
    (event: 'showControls'): void
    (event: 'play', payload: PlayVideoSwitch): void
    (event: 'changeVolume', payload: { deltaY?: number; volume?: number }): void
    (event: 'addMark'): void
    (event: 'removeMark', mark: PlayerMark): void
    (event: 'updateVideo', id: number | string): void
    (event: 'close'): void
  }
  jumpToMark: (type: 'prev' | 'next') => void
}

export function usePlayerTransport({emit, jumpToMark}: UsePlayerTransportOptions) {
  const session = inject<PlayerSessionContext | null>(PLAYER_SESSION_KEY, null)
  const appStore = useAppStore()
  const playerStore = usePlayerStore()
  const dialogsStore = useDialogsStore()
  const itemsStore = useItemsStore()
  const eventBus = useEventBus()
  const route = useRoute()
  const {xs, xl, mdAndDown, smAndDown} = useDisplay()
  const {t} = useI18n()

  const editingComponent = ref<VideoEditComponentRef | null>(null)
  const speeds = ref([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2])
  const transcodeHeights = ['0', '1080', '720', '480'] as const
  const video_editing = ref<MediaItem | null>(null)
  const dialog_video_edit = ref(false)

  const player = computed(() => playerStore)
  const is_separate_window = computed(() => isStandalonePlayerRoute(route))
  const video = computed(() => player.value.playlist[player.value.nowPlaying])
  const isAudioMode = computed(() => playerStore.isAudioMode)

  const density = computed(() => {
    if (smAndDown.value) return 'compact'
    if (mdAndDown.value) return 'comfortable'
    return 'default'
  })

  const isPrevDisabled = computed(() => isPlaylistNavDisabled({
    playlistMode: player.value.playlistMode,
    playlistShuffle: player.value.playlistShuffle,
    nowPlaying: player.value.nowPlaying,
    playlistLength: player.value.playlist.length,
    direction: 'prev',
  }))

  const isNextDisabled = computed(() => isPlaylistNavDisabled({
    playlistMode: player.value.playlistMode,
    playlistShuffle: player.value.playlistShuffle,
    nowPlaying: player.value.nowPlaying,
    playlistLength: player.value.playlist.length,
    direction: 'next',
  }))

  const volumeIcon = computed(() => {
    if (player.value.muted) return 'volume-mute'
    if (player.value.volume > 0.7) return 'volume-high'
    if (player.value.volume > 0.3) return 'volume-medium'
    return 'volume-low'
  })

  const msToTime = (time: number) => getReadableDuration(time)

  const play = () => {
    emit('showControls')
    playerStore.playerPlay()
  }

  const pause = () => {
    emit('showControls')
    playerStore.playerPause()
  }

  const stop = () => {
    emit('showControls')
    playerStore.playerStop()
  }

  const togglePause = () => {
    emit('showControls')
    player.value.paused ? play() : pause()
  }

  const navigatePlaylist = async (direction: 'prev' | 'next') => {
    const disabled = direction === 'prev' ? isPrevDisabled.value : isNextDisabled.value
    if (disabled) return

    playerStore.paused = false
    const current = video.value
    if (!current) return

    const nextIndex = resolvePlaylistIndex({
      playlistMode: player.value.playlistMode,
      playlistShuffle: player.value.playlistShuffle,
      nowPlaying: player.value.nowPlaying,
      playlistLength: player.value.playlist.length,
      direction,
    })
    if (nextIndex == null) return

    playerStore.nowPlaying = nextIndex

    emit('play', {n: video.value!, o: current})
    if (player.value.playlistVisible) {
      eventBus.emit('scrollToNowPlaying')
    }
  }

  const prev = () => navigatePlaylist('prev')
  const next = () => navigatePlaylist('next')

  const togglePlaylist = () => {
    player.value.playlistVisible = !player.value.playlistVisible
    if (!player.value.playlistVisible) return
    eventBus.emit('scrollToNowPlaying')
  }

  const toggleMarks = () => {
    playerStore.marksVisible = !playerStore.marksVisible
  }

  const toggleMute = () => {
    if (!player.value.player) return

    player.value.player.muted = !player.value.player.muted
    playerStore.muted = !player.value.muted
    let text = `${(player.value.volume * 100).toFixed()} %`
    if (player.value.muted) text = 'Muted'
    playerStore.changePlayerStatusText({
      text,
      icon: volumeIcon.value,
    })
  }

  const changeVolume = (e: { deltaY?: number; volume?: number }) => {
    emit('changeVolume', e)
  }

  const handleVolumeWheel = (e: WheelEvent, {slider = false}: { slider?: boolean } = {}) => {
    if (e.altKey) return

    preventWheelDefault(e)
    emit('showControls')

    changeVolume({
      deltaY: getVolumeDeltaFromWheel(e, {slider}),
    })
  }

  const handleVolumeSliderWheel = (e: WheelEvent) => {
    handleVolumeWheel(e, {slider: true})
  }

  const changeSpeed = (speed: number) => {
    playerStore.speed = speed
    if (player.value.player) {
      player.value.player.playbackRate = speed
    }

    playerStore.changePlayerStatusText({
      text: t('player.playback_speed', {
        speed: speed === 1 ? t('common.normal').toLowerCase() : speed,
      }),
      icon: 'play-speed',
    })
  }

  const transcodeQualityLabel = (height: string) => {
    if (height === '0') return t('player.controls.transcode_quality_original')
    return t(`player.controls.transcode_quality_${height}`)
  }

  const changeTranscodeMaxHeight = async (maxHeight: string | number) => {
    if (!session?.changeLiveTranscodeMaxHeight) return

    await session.changeLiveTranscodeMaxHeight(maxHeight)

    playerStore.changePlayerStatusText({
      text: transcodeQualityLabel(String(maxHeight)),
      icon: 'high-definition-box',
    })
  }

  const addMark = () => {
    if (dialogsStore.markAdding.show) {
      if (!dialogsStore.markAdding.submitting) {
        dialogsStore.closeMarkAdding()
      }
      return
    }
    emit('addMark')
  }

  const removeMark = (mark: PlayerMark) => {
    emit('removeMark', mark)
  }

  const setAsThumb = async () => {
    if (!video.value?.path) return

    const imgPath = path.join(
      appStore.mediaPath || '',
      'videos/thumbs',
      `${video.value.id}.jpg`
    )

    const time = player.value.currentTime

    try {
      await createThumb(time, video.value.path, imgPath, 320, true)
      emit('updateVideo', video.value.id)
      itemsStore.refreshThumb(video.value.id)
      if (is_separate_window.value && window.electronAPI?.send) {
        window.electronAPI.send('updateVideoFrames', video.value.id)
      }
      setNotification({
        title: t('player.video_thumb_updated'),
        text: video.value.path,
        icon: 'image',
        type: 'success',
      })
    } catch (e) {
      console.log(e)
      setNotification({
        title: t('player.video_thumb_not_updated'),
        text: String(e),
        icon: 'image',
        type: 'error',
      })
    }
  }

  const getVideo = async (): Promise<MediaItem | null> => {
    if (!video.value) return null

    const mediaTypeId = video.value.mediaTypeId ?? getDefaultMediaTypeId(appStore.mediaTypes) ?? undefined
    const query = {
      mediaTypeId,
      filters: [],
      sortBy: 'createdAt',
      direction: 'asc',
      find_duplicates: false,
      ids: [video.value.id],
    }

    try {
      const res = await typedApi.getMediaItems(query)
      return res.data.items?.[0] ?? null
    } catch (e) {
      console.log(e)
      return null
    }
  }

  const editVideo = async () => {
    video_editing.value = await getVideo()
    dialog_video_edit.value = true
  }

  const updateVideoInfo = async () => {
    if (!editingComponent.value?.save) return

    await editingComponent.value.save()
    const videoData = await getVideo()

    if (videoData) {
      player.value.playlist[player.value.nowPlaying] = {
        ...videoData,
        key: String(videoData.id),
      }
    }

    dialog_video_edit.value = false
    if (video.value) {
      emit('updateVideo', video.value.id)
    }
  }

  const deleteVideo = async (with_file: boolean) => {
    if (!video.value) return

    const video_edit = {...video.value}

    if (isNextDisabled.value) {
      if (!isPrevDisabled.value) {
        await prev()
      } else {
        emit('close')
      }
    } else if (video.value.id === video_edit.id) {
      await next()
    }

    const index = player.value.playlist.map((item) => item.id).indexOf(video_edit.id)
    if (index > -1) {
      player.value.playlist.splice(index, 1)
    }

    setTimeout(async () => {
      try {
        await typedApi.deleteMediaOne({
          type: 'videos',
          id: video_edit.id,
          with_file,
          path: video_edit.path,
        })

        if (is_separate_window.value && window.electronAPI?.send) {
          window.electronAPI.send('removeEntitiesFromState', {
            ids: [video_edit.id],
            type: 'media',
          })
        } else {
          eventBus.emit('removeEntitiesFromState', {
            detail: {
              ids: [video_edit.id],
              type: 'media',
            },
          })
        }
      } catch (e) {
        console.log(e)
      }
    }, 1000)
  }

  watch(dialog_video_edit, (value) => {
    playerStore.setKeyboardBlocked('edit', value)
  })

  watch(() => dialogsStore.markAdding.show, (value) => {
    playerStore.setKeyboardBlocked('mark', value)
  })

  return {
    player,
    playerStore,
    dialogsStore,
    editingComponent,
    speeds,
    transcodeHeights,
    video_editing,
    dialog_video_edit,
    video,
    isAudioMode,
    density,
    xs,
    xl,
    isPrevDisabled,
    isNextDisabled,
    volumeIcon,
    msToTime,
    togglePause,
    play,
    pause,
    stop,
    prev,
    next,
    togglePlaylist,
    toggleMarks,
    toggleMute,
    changeVolume,
    handleVolumeWheel,
    handleVolumeSliderWheel,
    changeSpeed,
    transcodeQualityLabel,
    changeTranscodeMaxHeight,
    addMark,
    removeMark,
    setAsThumb,
    editVideo,
    updateVideoInfo,
    deleteVideo,
    jumpToMark,
  }
}
