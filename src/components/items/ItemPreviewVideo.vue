<template>
  <div :class="{ 'no-file': !isFileExists }">
    <!-- CARD VIEW -->
    <v-responsive
      v-if="isViewCard"
      ref="previewRef"
      v-ripple="bigPreview ? false : { class: `text-primary` }"
      :aspect-ratio="16 / 9"
      class="video-preview-container"
      :class="{ 'is-hovered': isHovered }"
      @blur="handlePreviewBlur"
      @click="handlePreviewClick"
      @contextmenu="handlePreviewContextMenu"
      @mouseleave="handleMouseLeave"
      @mousemove="changePreviewTime"
      @mouseenter="handleMouseEnter"
    >
      <v-img
        :aspect-ratio="16 / 9"
        :src="thumb || undefined"
        class="thumb"
        contain
        @click.stop="play"
      />

      <div class="duration">{{ duration }}</div>

      <div
        v-if="isShowProgress && !playbackError"
        :style="{ right: progressPosition }"
        class="progress"
      />

      <div class="resolution">
        <div :class="quality.toLowerCase()"
          class="text">
          {{ quality }}
        </div>
        <div class="value">
          {{ height }}
        </div>
      </div>

      <!-- SYSTEM PLAYER (transcode disabled + unsupported format) -->
      <div
        v-if="showTranscodeDisabledNotice"
        class="player-only-notice"
      >
        <v-btn
          class="player-only-notice__btn"
          color="primary"
          variant="flat"
          rounded="pill"
          size="small"
          @click.stop="openInSystemPlayer"
        >
          {{ t('actions.open_system_player') }}
        </v-btn>
      </div>

      <!-- VIDEO PREVIEW -->
      <div
        v-if="showVideoPreview"
        :style="{ animationDelay: `${SETTINGS.delayVideoPreview}ms` }"
        class="preview"
        @click.stop="play"
      >
        <video
          ref="videoRef"
          :class="{ 'video-playback-error': playbackError }"
          :muted="muted"
          loop
          @error="handleVideoError"
          @loadeddata="handleVideoLoaded"
        />
        <div v-if="playbackError"
          class="playback-error">
          {{ t('player.preview_format_unavailable') }}
        </div>
      </div>

      <!-- TIMELINE PREVIEW -->
      <div
        v-if="showTimelinePreview"
        :class="{ 'no-frame': isFrameLost }"
        class="timeline"
        @click.stop="play"
      >
        <div v-if="isFrameLost"
          class="text-gen">
          <v-progress-circular v-if="isTaskRunning"
            indeterminate
            color="white">
            <v-icon size="small">mdi-image</v-icon>
          </v-progress-circular>
          <v-btn v-else
            @click.stop="restartImageGeneration"
            style="z-index: 1">
            <v-icon start>mdi-cogs</v-icon>
            Generate images
          </v-btn>
        </div>

        <img :src="frame ?? undefined"/>

        <div class="sections">
          <div
            v-for="(t, i) in timelines"
            :key="i"
            class="section"
            @mouseover="getFrameImg(t)"
          />
        </div>
      </div>
    </v-responsive>

    <!-- BIG PREVIEW ANIMATION -->
    <v-responsive
      v-if="bigPreviewAnimation && isHovered && !playbackError"
      :aspect-ratio="16 / 9"
      class="big-preview-plug"
    >
      <v-card
        class="d-flex align-center justify-center"
        color="black"
        height="100%"
        variant="flat"
      >
        <v-progress-circular indeterminate
          color="white">
          <v-icon>mdi-play</v-icon>
        </v-progress-circular>
      </v-card>
    </v-responsive>

    <!-- TIMELINE VIEW -->
    <div v-if="isViewTimeline">
      <div
        ref="storyRef"
        v-ripple="{ class: `text-primary` }"
        class="story"
        @click="play"
        @mouseleave="stopScrollStory"
        @mousemove.capture="scrollStory"
      >
        <div v-if="isFileExists && isFramesLost"
          class="message">
          <v-sheet>{{ t('media.preview.frames_in_progress') }}</v-sheet>
        </div>

        <div class="story-header">
          <div class="resolution">
            <div :class="quality.toLowerCase()"
              class="text">
              {{ quality }}
            </div>
            <div class="value">{{ height }}</div>
          </div>
          <div
            class="story-title"
            :title="media.name"
          >
            {{ media.name }}
          </div>
        </div>

        <div
          ref="storyWrapperRef"
          :class="{ hovered: isHovered }"
          class="wrapper"
        >
          <div
            v-for="(img, i) in frames"
            :key="i"
            class="frame"
          >
            <img :src="img"/>
            <div class="duration">{{ duration }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, onBeforeUnmount, nextTick} from 'vue'
import type {ComponentPublicInstance} from 'vue'
import {useI18n} from 'vue-i18n'
import path from 'path-browserify'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useTasksStore} from '@/stores/tasks'
import {useContextMenu} from '@/stores/contextMenu'
import {useEventBus} from '@/utils/eventBus'
import debounce from 'lodash/debounce'
import type {Handler} from 'mitt'
import {buildApiUrl} from '@/services/apiClient'
import {typedApi} from '@/services/typedApi'
import {buildLocalFileUrl, createThumb as createVideoThumb} from '@/services/fileService'
import {getCachedThumb, mediaThumbKey, setCachedThumb} from '@/utils/thumbDisplayCache'
import {
  isThumbUnavailable,
  resolveMediaThumbDisplayUrl,
  resolveTimelineFrameDisplayUrl,
} from '@/utils/thumbSource'
import {
  getReadableDuration,
  getReadableVideoHeight,
  getReadableVideoQuality,
} from '@/services/formatUtils'
import {setNotification} from '@/services/notificationService'
import {setOption} from '@/services/settingsService'
import {isLikelyBrowserDirectVideo} from '@/utils/transcodeCompatibility'
import {usePlayerStore} from '@/stores/player'
import {getChunkStart} from '@/utils/liveStreamChunk'
import {resolvePreviewVideoUrl, stopLiveTranscode} from '@/services/transcodeService'
import {isAppWindowFocused} from '@/utils/windowFocus'
import type {MediaItem} from '@/types/stores'

type TimeoutMap = {
  shrink?: ReturnType<typeof setTimeout>
  z?: ReturnType<typeof setTimeout>
  leave?: ReturnType<typeof setTimeout>
  cinema?: ReturnType<typeof setTimeout>
  [key: string]: ReturnType<typeof setTimeout> | undefined
}

const props = defineProps<{
  media: MediaItem
  isFileExists: boolean
}>()

const emit = defineEmits<{
  'update-big-preview': [value: boolean]
}>()

// store
const store = useAppStore()
const itemsStore = useItemsStore()
const settingsStore = useSettingsStore()
const tasksStore = useTasksStore()
const contextMenuStore = useContextMenu()
const playerStore = usePlayerStore()
const eventBus = useEventBus()
const {t} = useI18n()

const previewRef = ref<ComponentPublicInstance | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
const storyRef = ref<HTMLElement | null>(null)
const storyWrapperRef = ref<HTMLElement | null>(null)

const isHovered = ref(false)
const thumb = ref<string | null>(null)
const frame = ref<string | null>(null)
const frames = ref<string[]>([])
const progress = ref(0)

const timelines = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95]
const timeouts: TimeoutMap = {}
const bigPreview = ref(false)
const bigPreviewAnimation = ref(false)
const playbackError = ref(false)
const isSettingThumb = ref(false)
const isCreatingThumb = ref(false)
const thumbCreateAttempted = ref(false)
const thumbLoadStarted = ref(false)
const bigPreviewMenuActive = ref(false)
const isMounted = ref(false)

const getPreviewEl = (): HTMLElement | null => {
  const instance = previewRef.value
  return (instance?.$el as HTMLElement | undefined) ?? null
}

const mediaWidth = computed(() => Number(props.media.width) || 0)
const mediaHeight = computed(() => Number(props.media.height) || 0)
const mediaDuration = computed(() => Number(props.media.duration) || 0)

const ITEMS = computed(() => itemsStore)
const SETTINGS = computed(() => settingsStore)

const muted = computed(() => SETTINGS.value.play_sound_on_video_preview !== '1')

const quality = computed(() =>
  getReadableVideoQuality(mediaWidth.value, mediaHeight.value)
)

const isTaskRunning = computed(() =>
  tasksStore.list.find(task => task.title === 'Generating timeline images')
)

const height = computed(() =>
  getReadableVideoHeight(mediaWidth.value, mediaHeight.value)
)

const duration = computed(() =>
  getReadableDuration(mediaDuration.value)
)

const isFrameLost = computed(() =>
  frame.value ? frame.value.includes('unavailable.png') : true
)

const isFramesLost = computed(() =>
  frames.value[0] ? frames.value[0] === thumb.value : true
)

const progressPosition = computed(() => {
  const duration = mediaDuration.value
  if (!duration) return '100%'
  return `${100 - (progress.value / duration) * 100}%`
})

const isUnsupportedFormat = computed(() =>
  props.isFileExists && !isLikelyBrowserDirectVideo(props.media?.path),
)

const isTranscodeEnabled = computed(() =>
  settingsStore.transcodeUnsupportedFormats === '1',
)

const isVideoPreviewEnabled = computed(() =>
  SETTINGS.value.videoPreviewHover === 'video',
)

const shouldBlockVideoPreview = computed(() =>
  isUnsupportedFormat.value && isVideoPreviewEnabled.value,
)

const shouldBlockHoverPreview = computed(() =>
  shouldBlockVideoPreview.value && !isTranscodeEnabled.value,
)

const showTranscodeDisabledNotice = computed(() =>
  shouldBlockHoverPreview.value &&
  isHovered.value &&
  isViewCard.value,
)

const isShowProgress = computed(() =>
  SETTINGS.value.videoPreviewHover === 'video' &&
  props.isFileExists &&
  isHovered.value &&
  !shouldBlockVideoPreview.value,
)

const isViewCard = computed(() => Number(ITEMS.value.view) === 1)

const isViewTimeline = computed(() => Number(ITEMS.value.view) === 2)

const is_window_focused = computed(() => store.window.focused)

const showVideoPreview = computed(() =>
  SETTINGS.value.videoPreviewHover === 'video' &&
  props.isFileExists &&
  isHovered.value &&
  !shouldBlockVideoPreview.value,
)

const showTimelinePreview = computed(() =>
  SETTINGS.value.videoPreviewHover === 'timeline' &&
  props.isFileExists &&
  isHovered.value &&
  !shouldBlockHoverPreview.value,
)

const resetPreviewContainer = () => {
  bigPreviewAnimation.value = false

  const el = getPreviewEl()
  if (!el) return

  el.removeEventListener('animationend', removeClasses)
  el.classList.remove('big-preview', 'shrink-down')
  el.style.animation = ''
}

const removeClasses = () => {
  resetPreviewContainer()
}

const shrink = () => {
  const preview = getPreviewEl()
  if (!preview) {
    resetPreviewContainer()
    return
  }

  // Remove cloned element from DOM after animation is over
  preview.addEventListener('animationend', removeClasses, {once: true})

  // Trigger browser reflow to start animation
  preview.style.animation = 'none'
  preview.offsetHeight
  preview.style.animation = ''
  preview.classList.add('shrink-down')

  timeouts.shrink = setTimeout(() => {
    resetPreviewContainer()
  }, 400)
}

const toggleFullScreen = () => {
  const preview = getPreviewEl()
  if (!preview) return

  preview.removeEventListener("animationend", removeClasses)
  const {top, right, bottom, left} = preview.getBoundingClientRect()
  const inset = `${top}px ${right}px ${bottom}px ${left}px`
  preview.style.setProperty("--inset", inset)
  preview.style.setProperty("--preview-width", preview.offsetWidth + "px")
  preview.style.setProperty("--preview-height", preview.offsetHeight + "px")
  if (bigPreview.value && !playbackError.value) {
    preview.classList.add('big-preview')
  }
}

// Модифицированные методы
const loadThumb = (subfolder: 'thumbs' | 'grids', {bust = false} = {}) => {
  if (!props.media?.id) return

  const thumbUrl = bust
    ? buildLocalFileUrl(path.join(
      store.mediaPath,
      'videos',
      subfolder,
      `${props.media.id}.jpg`,
    ), false, true)
    : resolveMediaThumbDisplayUrl(store.mediaPath, 'videos', props.media.id, subfolder)

  thumb.value = thumbUrl

  if (thumbUrl && !isThumbUnavailable(thumbUrl)) {
    setCachedThumb(mediaThumbKey('videos', props.media.id), thumbUrl)
  }
}

const maybeCreateMissingThumb = async (imgPath: string) => {
  if (!props.isFileExists || !isThumbUnavailable(thumb.value)) return
  if (isCreatingThumb.value || thumbCreateAttempted.value) return

  isCreatingThumb.value = true
  thumbCreateAttempted.value = true
  try {
    await createThumb(imgPath)
  } finally {
    isCreatingThumb.value = false
  }
}

const getImg = async ({bust = false, allowCreate = true} = {}) => {
  if (!isMounted.value || !props.media?.id) return

  if (!bust) {
    const cached = getCachedThumb(mediaThumbKey('videos', props.media.id))
    if (cached && !isThumbUnavailable(cached)) {
      thumb.value = cached
      return
    }
  }

  const is_grid = settingsStore.videoPreviewStatic === "grid"
  const thumbsPath = path.join(store.mediaPath, 'videos/thumbs', `${props.media.id}.jpg`)

  if (is_grid && isViewCard.value) {
    loadThumb('grids', {bust})
    if (allowCreate && isThumbUnavailable(thumb.value)) {
      loadThumb('thumbs', {bust})
      await maybeCreateMissingThumb(thumbsPath)
    }
  } else {
    loadThumb('thumbs', {bust})
    if (allowCreate) {
      await maybeCreateMissingThumb(thumbsPath)
    }
  }
}

const createThumb = async (imgPath: string) => {
  try {
    await typedApi.taskCreateThumbForVideo({
      path: props.media.path,
      id: props.media.id,
    })
    await loadThumb('thumbs', {bust: true})
  } catch (e) {
    console.log(e)
  }
}

const togglePreviewMute = () => {
  const nextValue = SETTINGS.value.play_sound_on_video_preview === '1' ? '0' : '1'
  setOption(nextValue, 'play_sound_on_video_preview')
}

const shouldKeepBigPreviewOpen = () => {
  return bigPreview.value && (contextMenuStore.show || bigPreviewMenuActive.value)
}

const handlePreviewClick = () => {
  stopPlayingPreview()
}

const handlePreviewBlur = () => {
  stopPlayingPreview()
}

const setAsThumbFromPreview = async () => {
  if (!props.isFileExists || isSettingThumb.value) return

  const video = videoRef.value
  if (!video) return

  const currentTime = Number.isFinite(video.currentTime)
    ? video.currentTime
    : progress.value

  const imgPath = path.join(
    store.mediaPath || '',
    'videos/thumbs',
    `${props.media.id}.jpg`,
  )

  isSettingThumb.value = true
  try {
    await createVideoThumb(currentTime, props.media.path ?? '', imgPath, 320, true)
    itemsStore.refreshThumb(props.media.id)
    eventBus.emit('getItemsFromDb', {ids: [props.media.id], type: 'media'})
    setNotification({
      title: t('player.video_thumb_updated'),
      text: props.media.path,
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
  } finally {
    isSettingThumb.value = false
  }
}

const handlePreviewContextMenu = (e: MouseEvent) => {
  if (!bigPreview.value || !props.isFileExists || playbackError.value || shouldBlockVideoPreview.value) return

  e.preventDefault()
  e.stopPropagation()

  bigPreviewMenuActive.value = true

  contextMenuStore.showContextMenu({
    x: e.clientX,
    y: e.clientY,
    content: [
      {
        name: muted.value ? t('media.preview.unmute') : t('media.preview.mute'),
        type: 'item',
        icon: muted.value ? 'volume-off' : 'volume-high',
        action: () => {
          togglePreviewMute()
        },
      },
      {type: 'divider'},
      {
        name: t('player.controls.set_frame_as_thumb'),
        type: 'item',
        icon: 'image',
        disabled: isSettingThumb.value,
        action: () => {
          setAsThumbFromPreview()
        },
      },
    ],
  })
}

const play = (_inApp?: unknown) => {
  stopPlayingPreview({force: true})
  itemsStore.playVideo({
    video: props.media,
  })
}

const openInSystemPlayer = () => {
  stopPlayingPreview({force: true})
  itemsStore.playVideo({
    video: props.media,
    in_system: true,
  })
}

const handleVideoError = () => {
  playbackError.value = true
  // Очищаем источник видео
  if (videoRef.value) {
    videoRef.value.src = ''
  }
}

const restartImageGeneration = () => {
  eventBus.emit('getItemsFromDb', {ids: [props.media.id], type: 'media'})
}

const handleVideoLoaded = () => {
  // Видео успешно загружено
  playbackError.value = false
}

const changePreviewTime = debounce((e: MouseEvent) => {
  if (!props.isFileExists || playbackError.value || shouldBlockVideoPreview.value) return
  if (SETTINGS.value.videoPreviewHover !== "video") return

  const target = e.target as HTMLElement
  const rect = target.getBoundingClientRect()
  const percent = rect.width / 100
  const x = e.clientX - rect.left
  let progressValue = x / percent

  if (progressValue < 0) {
    progressValue = 0
  } else if (progressValue > 100) {
    progressValue = 100
  }

  progressValue = Math.floor(mediaDuration.value / 100 * progressValue)
  if (progress.value !== progressValue) {
    progress.value = progressValue
    void syncPreviewVideoPosition(progressValue)
  }
}, 50)

let previewPlaybackToken = 0
const previewUsesLiveStream = ref(false)

const isIgnorablePreviewError = (error: unknown): boolean => {
  const name = (error as { name?: string })?.name || ''
  return name === 'AbortError' || name === 'NotAllowedError'
}

const buildPreviewVideoUrl = () =>
  resolvePreviewVideoUrl(buildApiUrl, props.media.id, progress.value || 0)

const getPreviewStreamStart = (url: string): string | null => {
  try {
    return new URL(url).searchParams.get('start')
  } catch {
    return null
  }
}

const stopPreviewLiveTranscode = () => {
  if (!previewUsesLiveStream.value) return
  previewUsesLiveStream.value = false
  stopLiveTranscode(props.media.id).catch(() => {})
}

const syncPreviewVideoPosition = async (targetTime: number) => {
  const video = videoRef.value
  if (!video || !showVideoPreview.value) return

  const token = previewPlaybackToken
  const url = await buildPreviewVideoUrl()
  if (!url) return
  const isLive = url.includes('/transcode/stream')

  if (isLive) {
    previewUsesLiveStream.value = true
    const nextStart = getPreviewStreamStart(url)
    const currentStart = video.src ? getPreviewStreamStart(video.src) : null

    if (!video.src || currentStart !== nextStart) {
      video.src = url
      await waitForPreviewCanPlay(video, token)
    }

    if (token !== previewPlaybackToken) return
    const chunkStart = getChunkStart(targetTime)
    video.currentTime = Math.max(0, targetTime - chunkStart)
    return
  }

  previewUsesLiveStream.value = false
  if (!video.src || !video.src.includes(String(props.media.id))) {
    video.src = url
    await waitForPreviewCanPlay(video, token)
  }

  if (token !== previewPlaybackToken) return
  video.currentTime = Math.min(targetTime, video.duration || targetTime)
}

const waitForPreviewCanPlay = (video: HTMLVideoElement, token: number): Promise<void> => new Promise((resolve, reject) => {
  if (token !== previewPlaybackToken) {
    reject(new Error('Preview playback cancelled'))
    return
  }

  if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    resolve()
    return
  }

  const cleanup = () => {
    video.removeEventListener('canplay', onCanPlay)
    video.removeEventListener('error', onError)
  }

  const onCanPlay = () => {
    cleanup()
    resolve()
  }

  const onError = () => {
    cleanup()
    reject(video.error || new Error('Video failed to load'))
  }

  video.addEventListener('canplay', onCanPlay, {once: true})
  video.addEventListener('error', onError, {once: true})
})

const startPreviewPlayback = async () => {
  const token = ++previewPlaybackToken
  const video = videoRef.value
  if (!video || !showVideoPreview.value || !isAppWindowFocused()) return
  if (playerStore.active && playerStore.liveTranscodeMediaId === props.media.id) return

  const videoSrc = await buildPreviewVideoUrl()
  if (!videoSrc) {
    playbackError.value = true
    return
  }
  previewUsesLiveStream.value = videoSrc.includes('/transcode/stream')

  try {
    const needsNewSource = !video.src || !video.src.includes(String(props.media.id))
    if (needsNewSource) {
      video.src = videoSrc
      await waitForPreviewCanPlay(video, token)
    }

    if (token !== previewPlaybackToken || !showVideoPreview.value || !isAppWindowFocused()) return

    await video.play()
    playbackError.value = false
  } catch (error) {
    if (token !== previewPlaybackToken || isIgnorablePreviewError(error)) return

    console.error('Video playback error:', error)
    playbackError.value = true
    stopPreviewLiveTranscode()
    video.removeAttribute('src')
    video.load()
  }
}

const schedulePreviewPlayback = () => {
  clearTimeout(timeouts.z)
  if (!isAppWindowFocused()) return

  const delay = Math.max(0, Number(SETTINGS.value.delayVideoPreview) || 0)
  timeouts.z = setTimeout(() => {
    if (!showVideoPreview.value || !isAppWindowFocused()) return
    void startPreviewPlayback()
  }, delay)
}

const handleMouseEnter = () => {
  if (!props.isFileExists || isHovered.value || !isAppWindowFocused()) return

  clearTimeout(timeouts.leave)
  playbackError.value = false
  isHovered.value = true

  if (isVideoPreviewEnabled.value && !shouldBlockVideoPreview.value) {
    schedulePreviewPlayback()
  }

  if (SETTINGS.value.big_video_preview === '1' && !shouldBlockVideoPreview.value) {
    const totalDelay = (Number(SETTINGS.value.delayVideoPreview) || 0) +
      (Number(SETTINGS.value.big_video_preview_delay) || 0)

    timeouts.cinema = setTimeout(() => {
      emit('update-big-preview', true)
      bigPreview.value = true
      bigPreviewAnimation.value = true
    }, Math.floor(totalDelay))
  }
}

const stopPlayingPreview = ({force = false} = {}) => {
  if (!props.isFileExists) return
  if (!force && shouldKeepBigPreviewOpen()) return

  previewPlaybackToken += 1
  clearTimeout(timeouts.leave)
  clearTimeout(timeouts.z)
  bigPreviewMenuActive.value = false
  stopPreviewLiveTranscode()

  // Сбрасываем состояние предпросмотра
  isHovered.value = false
  resetPreviewContainer()

  emit('update-big-preview', false)
  bigPreview.value = false
  playbackError.value = false

  // Очищаем все таймауты
  for (const timeout in timeouts) {
    clearTimeout(timeouts[timeout])
  }

  // Правильно очищаем видео элемент
  if (videoRef.value) {
    try {
      videoRef.value.pause()
      videoRef.value.currentTime = 0
      videoRef.value.removeAttribute('src')
      videoRef.value.load()
    } catch (error) {
      console.error(error)
    }
  }
}

const handleMouseLeave = () => {
  clearTimeout(timeouts.leave)
  timeouts.leave = setTimeout(() => {
    stopPlayingPreview()
  }, 100)
}

const getFrameImg = (progressValue: number) => {
  frame.value = resolveTimelineFrameDisplayUrl(
    store.mediaPath,
    props.media.id,
    progressValue,
  )
}

const scrollStory = (e: MouseEvent) => {
  if (!storyRef.value || !storyWrapperRef.value) return

  const storyWidth = storyRef.value.clientWidth
  const wrapperWidth = storyWrapperRef.value.clientWidth
  if (wrapperWidth <= storyWidth) return

  const x = e.layerX
  const ratio = storyWidth / (wrapperWidth - storyWidth)
  const offset = Math.ceil(x / ratio)
  storyWrapperRef.value.style.left = "-" + offset + "px"
}

const stopScrollStory = () => {
  if (storyWrapperRef.value) {
    storyWrapperRef.value.style.left = "0"
  }
}

const initFrames = () => {
  frames.value = []
  for (let i = 0; i < timelines.length; i++) {
    const progressValue = timelines[i]
    const img = resolveTimelineFrameDisplayUrl(
      store.mediaPath,
      props.media.id,
      progressValue,
    )
    if (i == 0 && img.includes("unavailable.png")) {
      frames.value = []
      for (const j of timelines) frames.value.push(thumb.value ?? '')
      break
    } else {
      frames.value.push(img)
    }
  }
}

// Наблюдатели
watch(
  () => showVideoPreview.value && videoRef.value,
  (ready) => {
    if (!ready) return
    schedulePreviewPlayback()
  },
)

watch(() => contextMenuStore.show, (show) => {
  if (show || !bigPreviewMenuActive.value) return

  nextTick(() => {
    bigPreviewMenuActive.value = false
  })
})

watch(() => props.isFileExists, (exists) => {
  if (exists && isThumbUnavailable(thumb.value)) {
    getImg()
  }
})

watch(() => itemsStore.thumbRefreshKeys[Number(props.media.id)], (version) => {
  if (version == null) return
  const shouldRegenerate = itemsStore.consumeThumbRegenerate(props.media.id)
  if (shouldRegenerate) {
    thumbCreateAttempted.value = false
  }
  getImg({bust: true, allowCreate: shouldRegenerate})
  if (isViewTimeline.value) {
    initFrames()
  }
})

watch(() => ITEMS.value.view, (value) => {
  if (Number(value) === 2) {
    initFrames()
  }
  getImg()
})

watch(() => bigPreview.value, (value) => {
  if (value) {
    toggleFullScreen()
    return
  }

  if (getPreviewEl()?.classList.contains('big-preview')) {
    shrink()
  }
})

watch(() => is_window_focused.value, (value) => {
  if (!value) {
    stopPlayingPreview({force: true})
  }
})

// Обработчики событий
const handleUpdateVideoFrames: Handler = (event) => {
  const id = Number(event)
  if (Number(props.media.id) === id && isViewTimeline.value) {
    initFrames()
  }
}

const requestThumb = () => {
  if (thumbLoadStarted.value) return
  thumbLoadStarted.value = true
  void getImg()
}

// init
onMounted(async () => {
  isMounted.value = true
  await nextTick()
  requestThumb()

  if (!isMounted.value) return

  if (isViewTimeline.value) {
    initFrames()
  }

  eventBus.on('updateVideoFrames', handleUpdateVideoFrames)
})

onBeforeUnmount(() => {
  isMounted.value = false
  stopPlayingPreview({force: true})
  eventBus.off('updateVideoFrames', handleUpdateVideoFrames)

  for (const timeout in timeouts) {
    clearTimeout(timeouts[timeout])
  }

  if (videoRef.value) {
    try {
      videoRef.value.src = ''
    } catch (error) {
      console.error(error)
    }
  }
})
</script>

<style>
.video-playback-error {
  opacity: 0;
  display: none;
}

.preview {
  position: relative;
}

.playback-error {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #ff4444;
  background: rgba(0, 0, 0, 0.7);
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 12px;
  text-align: center;
}

.player-only-notice {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.35);

  .player-only-notice__btn {
    pointer-events: auto;
    opacity: 1;
  }
}

.big-preview-plug .v-card {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
</style>