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
        @load="onThumbLoad"
        @error="onThumbError"
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

      <!-- TRANSCODE FORMAT NOTICE -->
      <div
        v-if="showTranscodePreviewNotice"
        class="preview transcode-preview-notice"
        @click.stop="play"
      >
        <div class="playback-error">
          {{ t('player.preview_format_unavailable') }}
        </div>
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
        <div v-if="showFramesInProgressMessage"
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
            <img :src="img || undefined" @error="onStoryFrameError(i)"/>
            <div class="duration">{{ getTimelineFrameDuration(i) }}</div>
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
import {debounce} from '@/utils/debounce'
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
import {
  fetchPlayableInfo,
  resolvePreviewVideoUrl,
  stopLiveTranscode,
} from '@/services/transcodeService'
import {isAppWindowFocused} from '@/utils/windowFocus'
import type {MediaItem} from '@/types/stores'

type BigVideoPreviewSize = 'original' | 'full_height' | 'three_quarters'

const BIG_PREVIEW_SIZE_CLASSES: Record<BigVideoPreviewSize, string> = {
  original: 'big-preview-size-original',
  full_height: 'big-preview-size-full-height',
  three_quarters: 'big-preview-size-three-quarters',
}

const normalizeBigPreviewSize = (value: string | undefined): BigVideoPreviewSize => {
  if (value === 'original' || value === 'full_height' || value === 'three_quarters') {
    return value
  }
  return 'full_height'
}

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
const thumbFallbackStage = ref(0)
const bigPreviewMenuActive = ref(false)
const isMounted = ref(false)
const transcodeRequired = ref<boolean | null>(null)
let initFramesToken = 0

const resolveThumbFallback = (): string => {
  if (!props.media?.id) return ''

  if (thumb.value && !isThumbUnavailable(thumb.value)) {
    return thumb.value
  }

  const cached = getCachedThumb(mediaThumbKey('videos', props.media.id, 'thumbs'))
  if (cached && !isThumbUnavailable(cached)) {
    return cached
  }

  const url = resolveMediaThumbDisplayUrl(store.mediaPath, 'videos', props.media.id)
  return url && !isThumbUnavailable(url) ? url : ''
}

const probeDisplayImageUrl = (url: string): Promise<boolean> => new Promise((resolve) => {
  if (!url || isThumbUnavailable(url)) {
    resolve(false)
    return
  }

  const image = new Image()
  image.onload = () => resolve(!isThumbUnavailable(image.src))
  image.onerror = () => resolve(false)
  image.src = url
})

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

const bigPreviewSize = computed(() =>
  normalizeBigPreviewSize(SETTINGS.value.big_video_preview_size),
)

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

const getTimelineFrameDuration = (index: number) => {
  const percent = timelines[index]
  if (percent == null || !mediaDuration.value) {
    return duration.value
  }

  return getReadableDuration(Math.floor(mediaDuration.value * percent / 100))
}

const isFrameLost = computed(() =>
  frame.value ? frame.value.includes('unavailable.png') : true
)

const timelineUsesThumbFallback = ref(false)

const showFramesInProgressMessage = computed(() =>
  props.isFileExists &&
  timelineUsesThumbFallback.value &&
  Boolean(isTaskRunning.value),
)

const progressPosition = computed(() => {
  const duration = mediaDuration.value
  if (!duration) return '100%'
  return `${100 - (progress.value / duration) * 100}%`
})

const isUnsupportedFormat = computed(() =>
  props.isFileExists && !isLikelyBrowserDirectVideo(props.media?.path),
)

const needsTranscodePlayback = computed(() =>
  isUnsupportedFormat.value || transcodeRequired.value === true,
)

const isTranscodeEnabled = computed(() =>
  settingsStore.transcodeUnsupportedFormats === '1',
)

const isVideoPreviewEnabled = computed(() =>
  SETTINGS.value.videoPreviewHover === 'video',
)

const shouldBlockVideoPreview = computed(() =>
  needsTranscodePlayback.value && isVideoPreviewEnabled.value,
)

const showTranscodePreviewNotice = computed(() =>
  isViewCard.value &&
  isHovered.value &&
  shouldBlockVideoPreview.value &&
  isTranscodeEnabled.value,
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
  Object.values(BIG_PREVIEW_SIZE_CLASSES).forEach((className) => {
    el.classList.remove(className)
  })
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
    applyBigPreviewSize(preview)
  }
}

// Модифицированные методы
const getStaticPreviewSubfolder = (): 'thumbs' | 'grids' =>
  settingsStore.videoPreviewStatic === 'grid' && isViewCard.value ? 'grids' : 'thumbs'

const onThumbLoad = () => {
  thumbFallbackStage.value = 0
  if (thumb.value && !isThumbUnavailable(thumb.value) && props.media?.id) {
    setCachedThumb(
      mediaThumbKey('videos', props.media.id, getStaticPreviewSubfolder()),
      thumb.value,
    )
  }
}

const onThumbError = () => {
  if (thumbFallbackStage.value >= 2) {
    thumb.value = '/images/unavailable.png'
    return
  }

  thumbFallbackStage.value += 1
  thumbCreateAttempted.value = false
  void getImg({bust: true, allowCreate: true})
}

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
    setCachedThumb(mediaThumbKey('videos', props.media.id, subfolder), thumbUrl)
  }
}

const maybeCreateMissingThumb = async () => {
  if (!props.isFileExists || !thumb.value) return
  if (isCreatingThumb.value || thumbCreateAttempted.value) return

  const exists = await probeDisplayImageUrl(thumb.value)
  if (exists) return

  isCreatingThumb.value = true
  thumbCreateAttempted.value = true
  try {
    await createThumb('')
    loadThumb('thumbs', {bust: true})
  } finally {
    isCreatingThumb.value = false
  }
}

const getImg = async ({bust = false, allowCreate = true} = {}) => {
  if (!isMounted.value || !props.media?.id) return

  const subfolder = getStaticPreviewSubfolder()

  if (!bust) {
    const cached = getCachedThumb(mediaThumbKey('videos', props.media.id, subfolder))
    if (cached && !isThumbUnavailable(cached)) {
      thumb.value = cached
      return
    }
  }

  const is_grid = subfolder === 'grids'

  if (is_grid) {
    loadThumb('grids', {bust})
    if (allowCreate && thumb.value) {
      const gridExists = await probeDisplayImageUrl(thumb.value)
      if (!gridExists) {
        loadThumb('thumbs', {bust})
      }
    }
  } else {
    loadThumb('thumbs', {bust})
  }

  if (allowCreate) {
    await maybeCreateMissingThumb()
  }
}

const createThumb = async (_imgPath: string) => {
  try {
    await typedApi.taskCreateThumbForVideo({
      path: props.media.path,
      id: props.media.id,
    })
  } catch (e) {
    console.log(e)
  }
}

const togglePreviewMute = () => {
  const nextValue = SETTINGS.value.play_sound_on_video_preview === '1' ? '0' : '1'
  setOption(nextValue, 'play_sound_on_video_preview')
}

const applyBigPreviewSize = (preview: HTMLElement) => {
  Object.values(BIG_PREVIEW_SIZE_CLASSES).forEach((className) => {
    preview.classList.remove(className)
  })
  preview.classList.add(BIG_PREVIEW_SIZE_CLASSES[bigPreviewSize.value])

  if (mediaWidth.value > 0 && mediaHeight.value > 0) {
    preview.style.setProperty('--big-preview-native-width', `${mediaWidth.value}px`)
    preview.style.setProperty('--big-preview-native-height', `${mediaHeight.value}px`)
  }
}

const setBigPreviewSize = (size: BigVideoPreviewSize) => {
  setOption(size, 'big_video_preview_size')
  const preview = getPreviewEl()
  if (preview && bigPreview.value) {
    applyBigPreviewSize(preview)
  }
}

const buildBigPreviewSizeMenu = () => {
  const sizes: BigVideoPreviewSize[] = ['original', 'full_height', 'three_quarters']
  return sizes.map((size) => ({
    name: t(`media.preview.big_preview_size.${size}`),
    type: 'item' as const,
    icon: bigPreviewSize.value === size ? 'radiobox-marked' : 'radiobox-blank',
    action: () => {
      setBigPreviewSize(size)
    },
  }))
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
        name: t('media.preview.big_preview_size.title'),
        type: 'menu',
        icon: 'resize',
        menu: buildBigPreviewSizeMenu(),
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

const checkTranscodeRequired = async () => {
  if (!props.isFileExists || !props.media?.id || transcodeRequired.value !== null) {
    return
  }

  try {
    const playable = await fetchPlayableInfo(props.media.id)
    transcodeRequired.value = Boolean(
      playable.transcodeRequired ||
      playable.streamPlayback ||
      playable.mode === 'stream',
    )
  } catch {
    transcodeRequired.value = false
  }
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

  void (async () => {
    await checkTranscodeRequired()
    if (!isHovered.value || !isAppWindowFocused()) return

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
  })()
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

const initFrames = async () => {
  const token = ++initFramesToken
  if (!isMounted.value || !props.media?.id || !isViewTimeline.value) return

  await getImg()
  if (token !== initFramesToken || !isViewTimeline.value) return

  const thumbFallback = resolveThumbFallback()
  const firstTimelineUrl = resolveTimelineFrameDisplayUrl(
    store.mediaPath,
    props.media.id,
    timelines[0],
  )
  const hasTimeline = await probeDisplayImageUrl(firstTimelineUrl)
  if (token !== initFramesToken || !isViewTimeline.value) return

  if (!hasTimeline) {
    timelineUsesThumbFallback.value = true
    frames.value = timelines.map(() => thumbFallback)
    return
  }

  timelineUsesThumbFallback.value = false
  frames.value = timelines.map((progressValue) =>
    resolveTimelineFrameDisplayUrl(store.mediaPath, props.media.id, progressValue),
  )
}

const onStoryFrameError = (index: number) => {
  const fallback = resolveThumbFallback()
  if (!fallback || frames.value[index] === fallback) return

  const next = [...frames.value]
  next[index] = fallback
  frames.value = next
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
  transcodeRequired.value = null
  if (exists && isThumbUnavailable(thumb.value)) {
    getImg()
  }
})

watch(() => props.media?.id, () => {
  transcodeRequired.value = null
})

watch(() => itemsStore.thumbRefreshKeys[Number(props.media.id)], (version) => {
  if (version == null) return
  const shouldRegenerate = itemsStore.consumeThumbRegenerate(props.media.id)
  if (shouldRegenerate) {
    thumbCreateAttempted.value = false
  }
  void getImg({bust: true, allowCreate: shouldRegenerate}).then(() => {
    if (isViewTimeline.value) {
      void initFrames()
    }
  })
})

watch(() => ITEMS.value.view, (value) => {
  if (Number(value) === 2) {
    void initFrames()
    return
  }

  initFramesToken += 1
  void getImg()
})

watch(() => settingsStore.videoPreviewStatic, () => {
  thumbFallbackStage.value = 0
  thumbCreateAttempted.value = false
  void getImg({bust: true})
})

watch(isTaskRunning, (running, wasRunning) => {
  if (wasRunning && !running && isViewTimeline.value) {
    void initFrames()
  }
})

watch(thumb, () => {
  if (!isViewTimeline.value) return
  if (!frames.value.length || frames.value.every((src) => !src || isThumbUnavailable(src))) {
    void initFrames()
  }
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

watch(bigPreviewSize, () => {
  const preview = getPreviewEl()
  if (!preview || !bigPreview.value) return
  applyBigPreviewSize(preview)
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
    void initFrames()
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

  await getImg()
  if (isViewTimeline.value) {
    await initFrames()
  }

  eventBus.on('updateVideoFrames', handleUpdateVideoFrames)
})

onBeforeUnmount(() => {
  isMounted.value = false
  initFramesToken += 1
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

.transcode-preview-notice {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}
</style>