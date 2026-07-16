<template>
  <div :class="hostClasses">
    <!-- CARD VIEW -->
    <div
      v-if="isViewCard && showCardAnchor"
      ref="cardAnchorRef"
      class="video-preview-host__anchor"
      aria-hidden="true"
    >
      <v-img
        :src="thumb || undefined"
        cover
        class="video-preview-host__anchor-thumb"
      />
    </div>

    <Teleport to="body" :disabled="!useBigPreviewPortal">
      <v-responsive
        v-if="isViewCard"
        ref="previewRef"
        v-ripple="gridBigPreview.isExpanded.value ? false : { class: `text-primary` }"
        :aspect-ratio="16 / 9"
        class="video-preview-container"
        :class="previewContainerClasses"
        :style="previewAppearStyle"
        @blur="handlePreviewBlur"
        @click="handlePreviewClick"
        @contextmenu="handlePreviewContextMenu"
        @mouseleave="handleMouseLeave"
        @mousemove="changePreviewTime"
        @mouseenter="handleMouseEnter"
      >
      <v-img
        :key="thumbDisplayKey"
        :aspect-ratio="gridBigPreview.isVisual.value ? undefined : 16 / 9"
        :src="thumb || undefined"
        class="thumb"
        :contain="!isCompactHost && !gridBigPreview.isVisual.value"
        :cover="isCompactHost || gridBigPreview.isVisual.value"
        @click.stop="handleMediaClick"
        @load="onThumbLoad"
        @error="onThumbError"
      />

      <div
        v-if="showEmbeddedPlayHint"
        class="embedded-play-hint"
      >
        <v-icon color="white" size="48">mdi-play</v-icon>
      </div>

      <div v-if="!isCompactHost" class="duration">{{ duration }}</div>

      <div
        v-if="!isCompactHost && isShowProgress && !playbackError && !showPlaybackTimeline"
        :style="{ right: progressPosition }"
        class="progress"
      />

      <div v-if="!isCompactHost" class="resolution">
        <div :class="quality.toLowerCase()"
          class="text">
          {{ quality }}
        </div>
        <div class="value">
          {{ height }}
        </div>
      </div>

      <!-- PREVIEW UNAVAILABLE NOTICE (from <video> playback errors only) -->
      <div
        v-if="showPreviewUnavailableNotice"
        class="preview-unavailable-notice"
        @click.stop="handleMediaClick"
        @contextmenu="handlePreviewContextMenu"
      >
        <v-icon size="18" class="preview-unavailable-notice__icon">mdi-alert-outline</v-icon>
        <span>{{ t('player.preview_format_unavailable') }}</span>
      </div>

      <!-- VIDEO PREVIEW -->
      <div
        v-if="showVideoPreview && !playbackError"
        class="preview"
        @click.stop="handleMediaClick"
        @contextmenu="handlePreviewContextMenu"
      >
        <video
          ref="videoRef"
          :muted="muted"
          loop
          @error="handleVideoError"
          @loadeddata="handleVideoLoaded"
          @timeupdate="handleVideoTimeUpdate"
        />
      </div>

      <div
        v-if="showPlaybackTimeline"
        class="preview-playback-timeline"
        @click.stop
        @mousedown.stop
      >
        <div class="preview-playback-timeline__track">
          <div
            class="preview-playback-timeline__fill"
            :style="{ width: `${playbackTimelinePercent}%` }"
          />
        </div>
        <div class="preview-playback-timeline__time">
          <v-chip
            class="preview-playback-timeline__chip"
            color="black"
            density="compact"
            size="small"
            theme="dark"
            variant="flat"
          >
            {{ playbackTimelineTimeLabel }}
          </v-chip>
        </div>
      </div>

      <!-- TIMELINE PREVIEW -->
      <div
        v-if="showTimelinePreview"
        :class="{ 'no-frame': isFrameLost }"
        class="timeline"
        @click.stop="handleMediaClick"
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

        <div
          v-if="hoverGridFrameStyle"
          class="grid-sprite-frame"
          :style="hoverGridFrameStyle"
        />

        <div class="sections">
          <div
            v-for="frameIndex in GRID_FRAME_INDEXES"
            :key="frameIndex"
            class="section"
            @mouseover="setHoverFrameIndex(frameIndex)"
          />
        </div>
      </div>
    </v-responsive>
    </Teleport>

    <!-- BIG PREVIEW ANIMATION -->
    <v-responsive
      v-if="bigPreviewAnimation && isHovered && !playbackError && !isCompactHost && !showVideoPreview"
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
            v-for="frameIndex in GRID_FRAME_INDEXES"
            :key="frameIndex"
            class="frame"
          >
            <div
              v-if="storyFrameStyles[frameIndex]"
              class="grid-sprite-frame"
              :style="storyFrameStyles[frameIndex]"
            />
            <div class="duration">{{ getGridFrameDuration(frameIndex) }}</div>
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
import type {Handler} from 'mitt'
import {buildApiUrl} from '@/services/apiClient'
import {typedApi} from '@/services/typedApi'
import {buildLocalFileUrl, createThumb as createVideoThumb} from '@/services/fileService'
import {getCachedThumb, invalidateVideoThumbCaches, mediaThumbKey, setCachedThumb} from '@/utils/thumbDisplayCache'
import {
  GRID_FRAME_INDEXES,
  buildContainedThumbFallbackStyle,
  buildGridSpriteFrameStyle,
  buildStoryGridSpriteFrameStyle,
  buildStoryThumbFallbackStyle,
  getGridFramePercent,
} from '@/utils/gridSprite'
import {getMediaAspectRatio} from '@/utils/gridLayout'
import {
  isThumbUnavailable,
  resolveGridSpriteDisplayUrl,
  resolveMediaThumbDisplayUrl,
} from '@/utils/thumbSource'
import {probeDisplayImageUrl} from '@/utils/probeImageUrl'
import {
  getReadableDuration,
  getReadableVideoHeight,
  getReadableVideoQuality,
} from '@/services/formatUtils'
import {setNotification} from '@/services/notificationService'
import {setOption} from '@/services/settingsService'
import {usePlayerStore} from '@/stores/player'
import {LIVE_STREAM_CHUNK_SECONDS} from '@/utils/liveStreamChunk'
import {
  claimHoverVideoPreview,
  releaseHoverVideoPreview,
} from '@/utils/hoverPreviewSession'
import {abortVideoPlayback} from '@/utils/liveTranscodeLifecycle'
import {
  resolvePreviewVideoUrl,
  stopLiveTranscode,
} from '@/services/transcodeService'
import {isAppWindowFocused} from '@/utils/windowFocus'
import {buildVideoGridTaskParams} from '@shared/videoPreview'
import {useVideoBigPreview} from '@/composable/useVideoBigPreview'
import type {MediaItem} from '@/types/stores'

type BigVideoPreviewSize = 'original' | 'full_height' | 'two_thirds' | 'half'

const BIG_PREVIEW_SIZE_CLASSES: Record<BigVideoPreviewSize, string> = {
  original: 'big-preview-size-original',
  full_height: 'big-preview-size-full-height',
  two_thirds: 'big-preview-size-two-thirds',
  half: 'big-preview-size-half',
}

const thumbLoadInFlight = new Map<string, Promise<void>>()

const normalizeBigPreviewSize = (value: string | undefined): BigVideoPreviewSize => {
  if (
    value === 'original' ||
    value === 'full_height' ||
    value === 'two_thirds' ||
    value === 'half'
  ) {
    return value
  }
  // Migrate legacy option names.
  if (value === 'three_quarters') return 'two_thirds'
  return 'full_height'
}

type TimeoutMap = {
  shrink?: ReturnType<typeof setTimeout>
  z?: ReturnType<typeof setTimeout>
  leave?: ReturnType<typeof setTimeout>
  cinema?: ReturnType<typeof setTimeout>
  hoverCooldown?: ReturnType<typeof setTimeout>
  [key: string]: ReturnType<typeof setTimeout> | undefined
}

const HOVER_PREVIEW_AFTER_BIG_PREVIEW_MS = 500
let hoverPreviewReadyAt = 0

const armHoverPreviewCooldown = () => {
  hoverPreviewReadyAt = Date.now() + HOVER_PREVIEW_AFTER_BIG_PREVIEW_MS
}

const getHoverPreviewCooldownRemaining = () =>
  Math.max(0, hoverPreviewReadyAt - Date.now())

const props = withDefaults(defineProps<{
  media: MediaItem
  isFileExists: boolean
  previewHost?: 'grid' | 'embedded' | 'compact'
  previewActive?: boolean
  thumbUrl?: string
  previewStartTime?: number
  previewEndTime?: number | null
  playTime?: number
}>(), {
  previewHost: 'grid',
  previewActive: true,
  thumbUrl: undefined,
  previewEndTime: undefined,
  playTime: undefined,
})

const isEmbeddedHost = computed(() => props.previewHost === 'embedded')
const isCompactHost = computed(() => props.previewHost === 'compact')
const usesExternalThumb = computed(() => props.thumbUrl != null && props.thumbUrl !== '')
const hasFixedPreviewTime = computed(() => props.previewStartTime != null)
const showCardAnchor = computed(() =>
  gridBigPreview.isVisual.value || bigPreviewAnimation.value,
)
const useBigPreviewPortal = computed(() => gridBigPreview.isPortaled.value)

const hostClasses = computed(() => [
  'video-preview-host',
  `video-preview-host--${props.previewHost}`,
  {'no-file': !props.isFileExists},
])

const previewContainerClasses = computed(() => {
  const isFullscreenBigPreview = gridBigPreview.isVisual.value
  const isGridExpanding = gridBigPreview.isExpanding.value
  const isGridCollapsing = gridBigPreview.isCollapsing.value

  const classes: Record<string, boolean> = {
    'is-hovered': isHovered.value ||
      gridBigPreview.isActive.value ||
      gridBigPreview.isCollapsing.value ||
      isShrinking.value,
    'is-preview-active': showVideoPreview.value || showTimelinePreview.value,
    'is-hover-preview-ready': hoverPreviewReady.value && !isFullscreenBigPreview,
    'is-video-preview-enabled': isVideoPreviewEnabled.value,
    'video-preview-container--expanded': isFullscreenBigPreview,
    'video-preview-container--expanding': isGridExpanding,
    'video-preview-container--collapsing': isGridCollapsing,
    'video-preview-container--preview-fading': isGridCollapsing && collapsePreviewFading.value,
  }

  if (isFullscreenBigPreview && !isGridCollapsing) {
    classes[BIG_PREVIEW_SIZE_CLASSES[bigPreviewSize.value]] = true
  }

  return classes
})

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
const gridBigPreview = useVideoBigPreview()

const previewRef = ref<ComponentPublicInstance | null>(null)
const cardAnchorRef = ref<HTMLElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)
const storyRef = ref<HTMLElement | null>(null)
const storyWrapperRef = ref<HTMLElement | null>(null)

const isHovered = ref(false)
const thumb = ref<string | null>(null)
const thumbDisplayKey = computed(() =>
  itemsStore.thumbRefreshKeys[Number(props.media.id)] ?? 0,
)
const hoverFrameIndex = ref(0)
const gridSpriteUrl = ref<string | null>(null)
const storyUsesThumbFallback = ref(false)
const progress = ref(0)
const playbackTime = ref(0)

const timeouts: TimeoutMap = {}
const bigPreviewAnimation = ref(false)
const playbackError = ref(false)
const isSettingThumb = ref(false)
const isCreatingThumb = ref(false)
const thumbCreateAttempted = ref(false)
const thumbLoadStarted = ref(false)
const thumbFallbackStage = ref(0)
const bigPreviewMenuActive = ref(false)
const isShrinking = ref(false)
const holdPreviewVideoDuringCollapse = ref(false)
const collapsePreviewFading = ref(false)
const hoverPreviewReady = ref(false)
/** When false, <video> unmounts immediately (leave) without waiting for CSS hover grace. */
const allowHoverVideoElement = ref(false)
const isBigPreviewOpen = computed(() => gridBigPreview.isExpanded.value)
const isMounted = ref(false)
let initFramesToken = 0
let thumbProbeController: AbortController | null = null

const abortThumbProbe = () => {
  thumbProbeController?.abort()
  thumbProbeController = null
}

const clearPreviewResources = () => {
  abortThumbProbe()
  thumb.value = null
  gridSpriteUrl.value = null
  hoverFrameIndex.value = 0
  storyUsesThumbFallback.value = false
  thumbLoadStarted.value = false
  thumbCreateAttempted.value = false
  thumbFallbackStage.value = 0
}

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
  tasksStore.list.find(task => task.title === 'Generating grids images')
)

const height = computed(() =>
  getReadableVideoHeight(mediaWidth.value, mediaHeight.value)
)

const duration = computed(() =>
  getReadableDuration(mediaDuration.value)
)

const mediaAspectRatio = computed(() =>
  getMediaAspectRatio({
    width: mediaWidth.value,
    height: mediaHeight.value,
  }, 16 / 9),
)

const getGridFrameDuration = (frameIndex: number) => {
  if (!mediaDuration.value) {
    return duration.value
  }

  const percent = getGridFramePercent(frameIndex)
  return getReadableDuration(Math.floor(mediaDuration.value * percent / 100))
}

const hoverGridFrameStyle = computed(() => {
  const thumbFallback = resolveThumbFallback()

  if (storyUsesThumbFallback.value && thumbFallback) {
    return buildContainedThumbFallbackStyle(thumbFallback, mediaAspectRatio.value)
  }

  if (!gridSpriteUrl.value) return null
  return buildGridSpriteFrameStyle(
    gridSpriteUrl.value,
    hoverFrameIndex.value,
    mediaAspectRatio.value,
  )
})

const storyFrameStyles = computed(() => {
  const spriteUrl = gridSpriteUrl.value
  const thumbFallback = resolveThumbFallback()

  return GRID_FRAME_INDEXES.map((frameIndex) => {
    if (storyUsesThumbFallback.value && thumbFallback) {
      return buildStoryThumbFallbackStyle(thumbFallback, mediaAspectRatio.value)
    }

    if (!spriteUrl) return null
    return buildStoryGridSpriteFrameStyle(spriteUrl, frameIndex, mediaAspectRatio.value)
  })
})

const isFrameLost = computed(() => !hoverGridFrameStyle.value)

const showFramesInProgressMessage = computed(() =>
  props.isFileExists &&
  storyUsesThumbFallback.value &&
  Boolean(isTaskRunning.value),
)

const progressPosition = computed(() => {
  const duration = mediaDuration.value
  if (!duration) return '100%'
  return `${100 - (progress.value / duration) * 100}%`
})

const isVideoPreviewEnabled = computed(() =>
  SETTINGS.value.videoPreviewHover === 'video',
)

const showPreviewUnavailableNotice = computed(() =>
  playbackError.value && isViewCard.value && isHovered.value,
)

const isShowProgress = computed(() =>
  SETTINGS.value.videoPreviewHover === 'video' &&
  props.isFileExists &&
  isHovered.value &&
  !playbackError.value,
)

const isViewCard = computed(() =>
  isEmbeddedHost.value || isCompactHost.value || Number(ITEMS.value.view) === 1,
)

const isViewTimeline = computed(() =>
  !isEmbeddedHost.value && Number(ITEMS.value.view) === 2,
)

const is_window_focused = computed(() => store.window.focused)

const previewAppearStyle = computed(() => {
  const delay = Math.max(0, Number(SETTINGS.value.delayVideoPreview) || 0)
  return {
    '--preview-appear-delay': `${delay}ms`,
  }
})

const markHoverPreviewReady = () => {
  if (!isHovered.value || !showVideoPreview.value || gridBigPreview.isVisual.value) return
  hoverPreviewReady.value = true
  scheduleBigPreviewAfterHoverReady()
}

const resetHoverPreviewReady = () => {
  hoverPreviewReady.value = false
}

const scheduleBigPreviewAfterHoverReady = () => {
  if (SETTINGS.value.big_video_preview !== '1') return
  if (!isHovered.value || playbackError.value) return

  clearTimeout(timeouts.cinema)
  const delay = Math.max(0, Number(SETTINGS.value.big_video_preview_delay) || 0)
  timeouts.cinema = setTimeout(() => {
    if (!canOpenBigPreview()) return
    void openGridBigPreview()
  }, delay)
}

const showVideoPreview = computed(() =>
  SETTINGS.value.videoPreviewHover === 'video' &&
  props.isFileExists &&
  (
    allowHoverVideoElement.value ||
    gridBigPreview.isVisual.value ||
    holdPreviewVideoDuringCollapse.value
  ) &&
  !isShrinking.value,
)

const showTimelinePreview = computed(() =>
  SETTINGS.value.videoPreviewHover === 'timeline' &&
  props.isFileExists &&
  isHovered.value &&
  !isShrinking.value,
)

const showEmbeddedPlayHint = computed(() =>
  isEmbeddedHost.value &&
  props.isFileExists &&
  isHovered.value &&
  !gridBigPreview.isExpanded.value &&
  !gridBigPreview.isCollapsing.value &&
  !isShrinking.value &&
  !showVideoPreview.value &&
  !showTimelinePreview.value &&
  !showPreviewUnavailableNotice.value,
)

const showPlaybackTimeline = computed(() =>
  props.isFileExists &&
  showVideoPreview.value &&
  !playbackError.value &&
  mediaDuration.value > 0 &&
  (isEmbeddedHost.value || isBigPreviewOpen.value),
)

const playbackTimelinePercent = computed(() => {
  const total = mediaDuration.value
  if (!total) return 0
  return Math.min(100, Math.max(0, (playbackTime.value / total) * 100))
})

const playbackTimelineTimeLabel = computed(() => {
  const current = getReadableDuration(Math.floor(playbackTime.value))
  return `${current} / ${duration.value}`
})

const hidePreviewVideoImmediately = () => {
  previewPlaybackToken += 1
  resetHoverPreviewReady()
  allowHoverVideoElement.value = false
  stopPreviewLiveTranscode()
  releaseHoverVideoPreview(Number(props.media.id))
  abortVideoPlayback(videoRef.value)
}

const pausePreviewVideoOnly = () => {
  if (videoRef.value) {
    try {
      videoRef.value.pause()
    } catch (error) {
      console.error(error)
    }
  }
}

const waitForPreviewPaint = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })

const releasePreviewVideoAfterCollapse = () => {
  holdPreviewVideoDuringCollapse.value = false
  collapsePreviewFading.value = false
  hidePreviewVideoImmediately()
}

const resetBigPreviewOpen = () => {
  bigPreviewAnimation.value = false
  gridBigPreview.forceClose(getPreviewEl())
  emit('update-big-preview', false)
}

const openGridBigPreview = async () => {
  if (!canOpenBigPreview()) return

  const preview = getPreviewEl()
  if (!preview) return

  const sourceRect = gridBigPreview.captureRect(preview)
  bigPreviewAnimation.value = true
  emit('update-big-preview', true)

  const opened = await gridBigPreview.startExpand(() => getPreviewEl(), sourceRect)
  bigPreviewAnimation.value = false

  if (!opened) {
    resetBigPreviewOpen()
    return
  }

  const expandedPreview = getPreviewEl()
  if (expandedPreview) {
    applyBigPreviewMetrics(expandedPreview)
  }
}

const closeGridBigPreview = async () => {
  const preview = getPreviewEl()
  if (!preview || !gridBigPreview.isExpanded.value) {
    holdPreviewVideoDuringCollapse.value = false
    collapsePreviewFading.value = false
    gridBigPreview.forceClose(preview)
    return
  }

  holdPreviewVideoDuringCollapse.value = true
  collapsePreviewFading.value = false
  pausePreviewVideoOnly()

  const anchor = cardAnchorRef.value ?? preview
  const targetRect = gridBigPreview.captureRect(anchor)
  emit('update-big-preview', false)

  const collapsing = gridBigPreview.startCollapse(() => getPreviewEl(), targetRect)

  await nextTick()
  await waitForPreviewPaint()
  if (gridBigPreview.isCollapsing.value) {
    collapsePreviewFading.value = true
  }

  try {
    await collapsing
  } finally {
    releasePreviewVideoAfterCollapse()
  }
}

const restorePreviewLayout = (el: HTMLElement) => {
  gridBigPreview.clearFrame(el)
  el.style.removeProperty('--big-preview-native-width')
  el.style.removeProperty('--big-preview-native-height')
  el.style.removeProperty('animation')

  el.querySelectorAll<HTMLElement>('.thumb, .preview, .timeline').forEach((node) => {
    node.style.removeProperty('width')
    node.style.removeProperty('height')
    node.style.removeProperty('min-width')
    node.style.removeProperty('min-height')
    node.style.removeProperty('left')
    node.style.removeProperty('top')
    node.style.removeProperty('opacity')
    node.style.removeProperty('filter')
    node.style.removeProperty('transform')
    node.style.removeProperty('display')
    node.style.removeProperty('pointer-events')
    node.style.removeProperty('z-index')
  })

  void el.offsetHeight
}

const resetPreviewContainer = () => {
  bigPreviewAnimation.value = false

  const el = getPreviewEl()
  if (!el) return

  el.classList.remove(
    'video-preview-container--expanded',
  )
  Object.values(BIG_PREVIEW_SIZE_CLASSES).forEach((className) => {
    el.classList.remove(className)
  })

  restorePreviewLayout(el)
}

const removeClasses = () => {
  isShrinking.value = false
  isHovered.value = false
  bigPreviewAnimation.value = false
  holdPreviewVideoDuringCollapse.value = false
  collapsePreviewFading.value = false
  gridBigPreview.forceClose(getPreviewEl())
  emit('update-big-preview', false)
  stopPreviewLiveTranscode()

  for (const timeout in timeouts) {
    clearTimeout(timeouts[timeout])
  }

  armHoverPreviewCooldown()

  void nextTick(() => {
    resetPreviewContainer()
    finalizePreviewStop()
  })
}

const finalizePreviewStop = () => {
  previewPlaybackToken += 1
  playbackError.value = false
  playbackTime.value = 0
  resetHoverPreviewReady()
  allowHoverVideoElement.value = false
  stopPreviewLiveTranscode()
  releaseHoverVideoPreview(Number(props.media.id))
  abortVideoPlayback(videoRef.value)
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
  // First failure: retry load only. Creating on a transient error can overwrite
  // a scraped/custom poster with an ffmpeg frame from the video.
  const allowCreate = thumbFallbackStage.value >= 2
  void getImg({bust: true, allowCreate})
}

const loadThumb = (subfolder: 'thumbs' | 'grids', {bust = false} = {}) => {
  if (!props.media?.id) return

  if (bust) {
    invalidateVideoThumbCaches(props.media.id)
  }

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

const refreshGridPreviewIfNeeded = async () => {
  if (settingsStore.videoPreviewStatic !== 'grid' || !props.media.path) return

  try {
    await typedApi.taskCreateGrid(buildVideoGridTaskParams(props.media.path, `${props.media.id}.jpg`))
    invalidateVideoThumbCaches(props.media.id)
    itemsStore.refreshThumb(props.media.id, {regenerate: true})
  } catch (error) {
    console.error(error)
  }
}

const maybeCreateMissingThumb = async () => {
  if (!props.previewActive || !props.isFileExists || !thumb.value) return
  if (isCreatingThumb.value || thumbCreateAttempted.value) return

  abortThumbProbe()
  thumbProbeController = new AbortController()
  const exists = await probeDisplayImageUrl(thumb.value, thumbProbeController.signal)
  if (!isMounted.value) return
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

const loadImg = async ({bust = false, allowCreate = true} = {}) => {
  if (!props.previewActive || !isMounted.value || !props.media?.id) return

  if (usesExternalThumb.value) {
    thumb.value = props.thumbUrl ?? null
    return
  }

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
      abortThumbProbe()
      thumbProbeController = new AbortController()
      const gridExists = await probeDisplayImageUrl(thumb.value, thumbProbeController.signal)
      if (!isMounted.value) return
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

const getImg = async ({bust = false, allowCreate = true} = {}) => {
  if (!props.previewActive || !isMounted.value || !props.media?.id) return

  const subfolder = getStaticPreviewSubfolder()
  const key = `${props.media.id}:${subfolder}:${bust ? 1 : 0}:${allowCreate ? 1 : 0}`
  const existing = thumbLoadInFlight.get(key)
  if (existing) {
    await existing
    return
  }

  const promise = loadImg({bust, allowCreate})
  thumbLoadInFlight.set(key, promise)
  try {
    await promise
  } finally {
    thumbLoadInFlight.delete(key)
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

const applyBigPreviewMetrics = (preview: HTMLElement) => {
  if (mediaWidth.value > 0 && mediaHeight.value > 0) {
    preview.style.setProperty('--big-preview-native-width', `${mediaWidth.value}px`)
    preview.style.setProperty('--big-preview-native-height', `${mediaHeight.value}px`)
  }
}

const setBigPreviewSize = (size: BigVideoPreviewSize) => {
  setOption(size, 'big_video_preview_size')
  const preview = getPreviewEl()
  if (preview && gridBigPreview.isVisual.value) {
    applyBigPreviewMetrics(preview)
  }
}

const buildBigPreviewSizeMenu = () => {
  const sizes: BigVideoPreviewSize[] = ['original', 'full_height', 'two_thirds', 'half']
  return sizes.map((size) => ({
    name: t(`media.preview.big_preview_size.${size}`),
    type: 'item' as const,
    icon: bigPreviewSize.value === size ? 'radiobox-marked' : 'radiobox-blank',
    action: () => {
      setBigPreviewSize(size)
    },
  }))
}

const shouldKeepBigPreviewOpen = () =>
  isBigPreviewOpen.value && (contextMenuStore.show || bigPreviewMenuActive.value)

const hasActivePreviewState = () =>
  isHovered.value || gridBigPreview.isActive.value || isShrinking.value

const canOpenBigPreview = () =>
  isHovered.value &&
  isAppWindowFocused() &&
  props.isFileExists &&
  !playbackError.value &&
  hoverPreviewReady.value &&
  isVideoPreviewEnabled.value &&
  SETTINGS.value.big_video_preview === '1'

const handlePreviewClick = () => {
  if (gridBigPreview.isCollapsing.value || isShrinking.value) return
  if (gridBigPreview.isVisual.value) {
    // Clear keep-open flags so an earlier context menu cannot block dismiss.
    contextMenuStore.show = false
    bigPreviewMenuActive.value = false
    stopPlayingPreview()
    return
  }
  stopPlayingPreview()
}

const handleMediaClick = () => {
  if (gridBigPreview.isCollapsing.value || isShrinking.value) return
  if (gridBigPreview.isVisual.value) {
    contextMenuStore.show = false
    bigPreviewMenuActive.value = false
    stopPlayingPreview()
    return
  }
  play()
}

const handlePreviewBlur = () => {
  if (isBigPreviewOpen.value) return
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
    invalidateVideoThumbCaches(props.media.id)
    loadThumb('thumbs', {bust: true})
    if (getStaticPreviewSubfolder() === 'grids') {
      loadThumb('grids', {bust: true})
    }
    itemsStore.refreshThumb(props.media.id, {regenerate: true})
    eventBus.emit('getItemsFromDb', {ids: [props.media.id], type: 'media'})
    void refreshGridPreviewIfNeeded()
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

const buildBigPreviewContextMenu = () => {
  const items: Array<Record<string, unknown>> = [
    {
      name: muted.value ? t('media.preview.unmute') : t('media.preview.mute'),
      type: 'item',
      icon: muted.value ? 'volume-off' : 'volume-high',
      action: () => {
        togglePreviewMute()
      },
    },
  ]

  items.push(
    {type: 'divider'},
    {
      name: t('media.preview.big_preview_size.title'),
      type: 'menu',
      icon: 'resize',
      menu: buildBigPreviewSizeMenu(),
    },
  )

  items.push(
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
  )

  return items
}

const handlePreviewContextMenu = (e: MouseEvent) => {
  // isVisual covers expanded + expanding; collapsing should not open the menu.
  if (
    !gridBigPreview.isVisual.value ||
    gridBigPreview.isCollapsing.value ||
    !props.isFileExists
  ) return

  e.preventDefault()
  e.stopPropagation()

  bigPreviewMenuActive.value = true

  // Keep the cinema layer under the global context menu while it is open.
  const preview = getPreviewEl()
  if (preview) preview.style.zIndex = '19990'

  contextMenuStore.showContextMenu({
    x: e.clientX,
    y: e.clientY,
    content: buildBigPreviewContextMenu(),
  })
}

const play = (_inApp?: unknown) => {
  if (isBigPreviewOpen.value || isShrinking.value) {
    stopPlayingPreview()
    return
  }
  stopPlayingPreview({force: true})
  itemsStore.playVideo({
    video: props.media,
    ...(props.playTime != null ? {time: props.playTime} : {}),
  })
}

const handleVideoError = () => {
  playbackError.value = true
  allowHoverVideoElement.value = false
  resetHoverPreviewReady()
  abortVideoPlayback(videoRef.value)
  releaseHoverVideoPreview(Number(props.media.id))
}

const restartImageGeneration = () => {
  eventBus.emit('getItemsFromDb', {ids: [props.media.id], type: 'media'})
}

const handleVideoLoaded = () => {
  playbackError.value = false
  syncPlaybackTimeFromVideo()
}

const resolvePreviewPlaybackTime = (): number => {
  const video = videoRef.value
  if (!video || !Number.isFinite(video.currentTime)) {
    return progress.value
  }

  if (previewUsesLiveStream.value) {
    const startParam = video.src ? getPreviewStreamStart(video.src) : null
    const streamStart = startParam != null ? Number(startParam) : 0
    return streamStart + video.currentTime
  }

  return video.currentTime
}

const syncPlaybackTimeFromVideo = () => {
  if (!showVideoPreview.value) return

  const total = mediaDuration.value
  if (!total) return

  playbackTime.value = Math.min(Math.max(0, resolvePreviewPlaybackTime()), total)
}

const handleVideoTimeUpdate = () => {
  if (
    props.previewEndTime != null &&
    props.previewStartTime != null &&
    resolvePreviewPlaybackTime() > props.previewEndTime
  ) {
    void syncPreviewVideoPosition(props.previewStartTime)
    return
  }

  syncPlaybackTimeFromVideo()
}

const changePreviewTime = (e: MouseEvent) => {
  // Progress UI updates immediately; actual seeks are coalesced below.
  applyPreviewTimeFromPointer(e, {seek: false})
  scheduleHoverPreviewSeek(e)
}

let hoverSeekTimer: ReturnType<typeof setTimeout> | null = null
let hoverSeekInFlight = false
let hoverSeekPending: number | null = null

const flushHoverPreviewSeek = (targetTime: number) => {
  if (hoverSeekInFlight) {
    hoverSeekPending = targetTime
    return
  }
  hoverSeekInFlight = true
  void syncPreviewVideoPosition(targetTime, {allowLiveChunkSwitch: false})
    .catch(() => {})
    .finally(() => {
      hoverSeekInFlight = false
      if (hoverSeekPending == null) return
      const next = hoverSeekPending
      hoverSeekPending = null
      flushHoverPreviewSeek(next)
    })
}

const scheduleHoverPreviewSeek = (e: Pick<MouseEvent, 'clientX'>) => {
  if (hoverSeekTimer) clearTimeout(hoverSeekTimer)
  hoverSeekTimer = setTimeout(() => {
    hoverSeekTimer = null
    const progressValue = getPreviewTimeFromPointer(e.clientX)
    if (progressValue == null) return
    flushHoverPreviewSeek(progressValue)
  }, 220)
}

const getPreviewTimeFromPointer = (clientX: number): number | null => {
  if (hasFixedPreviewTime.value) return null
  if (!props.isFileExists || playbackError.value) return null
  if (SETTINGS.value.videoPreviewHover !== 'video') return null
  if (!mediaDuration.value) return null

  const preview = getPreviewEl()
  if (!preview) return null

  const rect = preview.getBoundingClientRect()
  if (rect.width <= 0) return null

  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  return Math.floor(mediaDuration.value * ratio)
}

const applyPreviewTimeFromPointer = (
  e: Pick<MouseEvent, 'clientX'>,
  {seek = false}: {seek?: boolean} = {},
) => {
  const progressValue = getPreviewTimeFromPointer(e.clientX)
  if (progressValue == null) return

  if (progress.value !== progressValue) {
    progress.value = progressValue
    // Keep the playback timeline on the real video playhead; pointer only
    // drives hover scrubbing (`progress`) and deferred seeks.
    if (!showPlaybackTimeline.value) {
      playbackTime.value = progressValue
    }
  }

  if (seek) {
    flushHoverPreviewSeek(progressValue)
  }
}

let previewPlaybackToken = 0
const previewUsesLiveStream = ref(false)

const isIgnorablePreviewError = (error: unknown): boolean => {
  const name = (error as { name?: string })?.name || ''
  return name === 'AbortError' || name === 'NotAllowedError'
}

const scheduleHoverPreviewUi = () => {
  if (!isHovered.value || !isAppWindowFocused()) return

  if (isVideoPreviewEnabled.value) {
    schedulePreviewPlayback()
  }
  // Big preview is armed from markHoverPreviewReady after hover video plays.
}

const buildPreviewVideoUrl = (startSeconds = progress.value || 0) =>
  resolvePreviewVideoUrl(buildApiUrl, props.media.id, startSeconds)

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

const yieldHoverVideoDecoder = () => {
  previewPlaybackToken += 1
  resetHoverPreviewReady()
  allowHoverVideoElement.value = false
  hoverSeekInFlight = false
  hoverSeekPending = null
  if (hoverSeekTimer) {
    clearTimeout(hoverSeekTimer)
    hoverSeekTimer = null
  }
  clearTimeout(timeouts.z)
  stopPreviewLiveTranscode()
  abortVideoPlayback(videoRef.value)
}

const getLoadedPreviewMediaId = (video: HTMLVideoElement): number | null => {
  // Prefer currentSrc — after abort(), .src falls back to the page URL and can
  // falsely match media ids that appear in the host/port (e.g. 3000).
  const raw = video.currentSrc || ''
  if (!raw || raw === window.location.href) return null
  const match = raw.match(/\/api\/video\/(\d+)(?:\/|\?|$)/)
  if (!match) return null
  return Number(match[1])
}

const waitForPreviewSeek = (video: HTMLVideoElement, token: number): Promise<void> => new Promise((resolve) => {
  if (token !== previewPlaybackToken) {
    resolve()
    return
  }

  if (video.seeking) {
    const onSeeked = () => {
      clearTimeout(timeoutId)
      resolve()
    }
    const timeoutId = setTimeout(() => {
      video.removeEventListener('seeked', onSeeked)
      resolve()
    }, 400)
    video.addEventListener('seeked', onSeeked, {once: true})
    return
  }

  resolve()
})

const syncPreviewVideoPosition = async (
  targetTime: number,
  {allowLiveChunkSwitch = false}: {allowLiveChunkSwitch?: boolean} = {},
): Promise<boolean> => {
  const video = videoRef.value
  if (!video || !showVideoPreview.value) return false

  const mediaId = Number(props.media.id)
  const loadedMediaId = getLoadedPreviewMediaId(video)
  const activeSrc = video.currentSrc || ''

  // Prefer cheap in-place seeks. Reassigning src (esp. live chunks) starts a
  // download/encode storm while scrubbing.
  if (loadedMediaId === mediaId && activeSrc) {
    const isLiveSrc = activeSrc.includes('/transcode/stream')
    if (isLiveSrc) {
      const currentStart = Number(getPreviewStreamStart(activeSrc) || 0)
      const maxInChunk = currentStart + LIVE_STREAM_CHUNK_SECONDS - 0.05
      const withinCurrentSegment = targetTime >= currentStart - 0.05 && targetTime <= maxInChunk
      if (withinCurrentSegment || !allowLiveChunkSwitch) {
        const clamped = Math.min(
          Math.max(targetTime, currentStart),
          Math.max(currentStart, maxInChunk),
        )
        const relative = Math.max(0, clamped - currentStart)
        if (Math.abs(video.currentTime - relative) > 0.12) {
          if (video.seeking) {
            return true
          }
          video.currentTime = relative
          await waitForPreviewSeek(video, previewPlaybackToken)
        }
        syncPlaybackTimeFromVideo()
        return true
      }
    } else {
      const nextTime = Math.min(targetTime, video.duration || targetTime)
      if (Number.isFinite(nextTime) && Math.abs(video.currentTime - nextTime) > 0.12) {
        if (video.seeking) {
          return true
        }
        video.currentTime = nextTime
        await waitForPreviewSeek(video, previewPlaybackToken)
      }
      syncPlaybackTimeFromVideo()
      return true
    }
  }

  const token = previewPlaybackToken
  const url = await buildPreviewVideoUrl(allowLiveChunkSwitch ? targetTime : Math.min(targetTime, LIVE_STREAM_CHUNK_SECONDS - 0.1))
  if (!url) return false
  if (token !== previewPlaybackToken) return false
  const isLive = url.includes('/transcode/stream')

  if (isLive) {
    previewUsesLiveStream.value = true
    const nextStart = getPreviewStreamStart(url)
    const currentStart = activeSrc.includes('/transcode/stream') && loadedMediaId === mediaId
      ? getPreviewStreamStart(activeSrc)
      : null

    if (loadedMediaId !== mediaId || currentStart !== nextStart) {
      video.src = url
      await waitForPreviewCanPlay(video, token, {live: true})
    }

    if (token !== previewPlaybackToken) return false
    const streamStart = Number(nextStart) || 0
    const relative = Math.max(0, targetTime - streamStart)
    if (Math.abs(video.currentTime - relative) > 0.12) {
      video.currentTime = relative
      await waitForPreviewSeek(video, token)
      if (token !== previewPlaybackToken) return false
    }
    syncPlaybackTimeFromVideo()
    return true
  }

  previewUsesLiveStream.value = false
  if (loadedMediaId !== mediaId) {
    video.src = url
    await waitForPreviewCanPlay(video, token)
  }

  if (token !== previewPlaybackToken) return false
  const nextTime = Math.min(targetTime, video.duration || targetTime)
  if (Number.isFinite(nextTime) && Math.abs(video.currentTime - nextTime) > 0.12) {
    video.currentTime = nextTime
    await waitForPreviewSeek(video, token)
    if (token !== previewPlaybackToken) return false
  }
  syncPlaybackTimeFromVideo()
  return true
}

const waitForPreviewCanPlay = (
  video: HTMLVideoElement,
  token: number,
  {live = false}: {live?: boolean} = {},
): Promise<void> => new Promise((resolve, reject) => {
  if (token !== previewPlaybackToken) {
    reject(new Error('Preview playback cancelled'))
    return
  }

  if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    resolve()
    return
  }

  const cleanup = () => {
    clearTimeout(timeoutId)
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

  // Live FFmpeg warm-up often exceeds the direct-play window.
  const timeoutId = setTimeout(() => {
    cleanup()
    reject(new Error('Preview playback timed out'))
  }, live ? 45000 : 8000)

  video.addEventListener('canplay', onCanPlay, {once: true})
  video.addEventListener('error', onError, {once: true})
})

const startPreviewPlayback = async () => {
  const token = ++previewPlaybackToken
  const video = videoRef.value
  if (!video || !showVideoPreview.value || !isAppWindowFocused()) {
    if (token === previewPlaybackToken && isHovered.value) {
      markPreviewUnavailable()
    }
    return
  }
  if (playerStore.active && playerStore.liveTranscodeMediaId === props.media.id) return

  const mediaId = Number(props.media.id)
  claimHoverVideoPreview(mediaId, yieldHoverVideoDecoder)

  const targetTime = hasFixedPreviewTime.value && props.previewStartTime != null
    ? props.previewStartTime
    : progress.value

  if (hasFixedPreviewTime.value && props.previewStartTime != null) {
    progress.value = props.previewStartTime
    playbackTime.value = props.previewStartTime
  }

  try {
    const positioned = await syncPreviewVideoPosition(targetTime, {
      allowLiveChunkSwitch: true,
    })
    if (!positioned) {
      if (token === previewPlaybackToken) {
        markPreviewUnavailable()
      }
      return
    }

    if (token !== previewPlaybackToken || !showVideoPreview.value || !isAppWindowFocused()) {
      if (token === previewPlaybackToken) releaseHoverVideoPreview(mediaId)
      return
    }

    await video.play()
    playbackError.value = false
    syncPlaybackTimeFromVideo()
    markHoverPreviewReady()
  } catch (error) {
    if (token !== previewPlaybackToken || isIgnorablePreviewError(error)) {
      if (token === previewPlaybackToken) releaseHoverVideoPreview(mediaId)
      return
    }

    console.error('Video playback error:', error)
    markPreviewUnavailable()
  }
}

const markPreviewUnavailable = () => {
  playbackError.value = true
  allowHoverVideoElement.value = false
  resetHoverPreviewReady()
  stopPreviewLiveTranscode()
  abortVideoPlayback(videoRef.value)
  releaseHoverVideoPreview(Number(props.media.id))
}

const schedulePreviewPlayback = () => {
  clearTimeout(timeouts.z)
  if (!isAppWindowFocused()) return
  if (SETTINGS.value.videoPreviewHover !== 'video' || !props.isFileExists) return

  const startHoverVideo = async () => {
    if (!isHovered.value || !isAppWindowFocused()) return

    const mediaId = Number(props.media.id)

    // Resolve before mounting — unsupported formats get the notice immediately.
    const previewUrl = await resolvePreviewVideoUrl(
      buildApiUrl,
      mediaId,
      progress.value || 0,
    )
    if (!isHovered.value || !isAppWindowFocused()) return
    if (!previewUrl) {
      markPreviewUnavailable()
      return
    }

    // Claim before mounting so another card's decoder is torn down first.
    claimHoverVideoPreview(mediaId, yieldHoverVideoDecoder)
    allowHoverVideoElement.value = true
    await nextTick()

    if (!isHovered.value || !isAppWindowFocused() || !allowHoverVideoElement.value) {
      allowHoverVideoElement.value = false
      releaseHoverVideoPreview(mediaId)
      abortVideoPlayback(videoRef.value)
      return
    }

    if (!videoRef.value) {
      markPreviewUnavailable()
      return
    }

    void startPreviewPlayback()
  }

  const delay = Math.max(0, Number(SETTINGS.value.delayVideoPreview) || 0)
  if (delay === 0) {
    void startHoverVideo()
    return
  }
  timeouts.z = setTimeout(() => {
    void startHoverVideo()
  }, delay)
}

const applyFixedPreviewTime = () => {
  if (props.previewStartTime == null) return

  progress.value = props.previewStartTime
  playbackTime.value = props.previewStartTime
}

let lastHoverClientX: number | null = null

const handleMouseEnter = (e?: MouseEvent) => {
  if (!props.isFileExists || isHovered.value || !isAppWindowFocused()) return

  if (e) {
    lastHoverClientX = e.clientX
  }

  clearTimeout(timeouts.leave)
  clearTimeout(timeouts.hoverCooldown)

  const cooldownRemaining = getHoverPreviewCooldownRemaining()
  if (cooldownRemaining > 0) {
    timeouts.hoverCooldown = setTimeout(() => {
      handleMouseEnter(
        lastHoverClientX == null
          ? undefined
          : ({clientX: lastHoverClientX} as MouseEvent),
      )
    }, cooldownRemaining)
    return
  }

  playbackError.value = false
  isHovered.value = true

  if (hasFixedPreviewTime.value) {
    applyFixedPreviewTime()
  } else if (lastHoverClientX != null) {
    // Seed seek before playback starts so preview doesn't begin at 0:00.
    applyPreviewTimeFromPointer({clientX: lastHoverClientX})
  }

  // Start preview immediately for browser-direct containers (mp4/webm).
  scheduleHoverPreviewUi()
}

const stopPlayingPreview = ({force = false} = {}) => {
  if (!props.isFileExists && !hasActivePreviewState()) return
  if (isShrinking.value && !force) return
  if (gridBigPreview.isCollapsing.value && !force) return
  if (!force && shouldKeepBigPreviewOpen()) return

  clearTimeout(timeouts.leave)
  clearTimeout(timeouts.cinema)
  bigPreviewMenuActive.value = false

  if (force && (isShrinking.value || gridBigPreview.isCollapsing.value)) {
    clearTimeout(timeouts.shrink)
    holdPreviewVideoDuringCollapse.value = false
    collapsePreviewFading.value = false
    contextMenuStore.show = false
    gridBigPreview.forceClose(getPreviewEl())
    removeClasses()
    return
  }

  const shouldShrink = !force && isBigPreviewOpen.value

  if (shouldShrink) {
    clearTimeout(timeouts.z)
    bigPreviewAnimation.value = false

    void closeGridBigPreview().finally(() => {
      removeClasses()
    })
    return
  }

  clearTimeout(timeouts.z)
  clearTimeout(timeouts.shrink)
  hidePreviewVideoImmediately()
  stopPreviewLiveTranscode()
  isShrinking.value = false
  isHovered.value = false
  bigPreviewAnimation.value = false
  gridBigPreview.forceClose(getPreviewEl())
  emit('update-big-preview', false)

  for (const timeout in timeouts) {
    clearTimeout(timeouts[timeout])
  }

  resetPreviewContainer()
  finalizePreviewStop()
}

const handleMouseLeave = () => {
  clearTimeout(timeouts.hoverCooldown)

  if (gridBigPreview.isActive.value || isShrinking.value || bigPreviewAnimation.value) return

  // Unmount <video> immediately — do not wait for the CSS leave grace timer.
  previewPlaybackToken += 1
  resetHoverPreviewReady()
  allowHoverVideoElement.value = false
  hoverSeekInFlight = false
  hoverSeekPending = null
  if (hoverSeekTimer) {
    clearTimeout(hoverSeekTimer)
    hoverSeekTimer = null
  }
  clearTimeout(timeouts.z)
  clearTimeout(timeouts.cinema)
  stopPreviewLiveTranscode()
  releaseHoverVideoPreview(Number(props.media.id))
  abortVideoPlayback(videoRef.value)

  clearTimeout(timeouts.leave)
  timeouts.leave = setTimeout(() => {
    stopPlayingPreview()
  }, 100)
}

const setHoverFrameIndex = (frameIndex: number) => {
  hoverFrameIndex.value = frameIndex
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

const ensureGridSpriteLoaded = async () => {
  if (!props.media?.id) return false

  const gridUrl = resolveGridSpriteDisplayUrl(store.mediaPath, props.media.id)
  if (!gridUrl) {
    storyUsesThumbFallback.value = true
    gridSpriteUrl.value = null
    return false
  }

  abortThumbProbe()
  thumbProbeController = new AbortController()
  const hasGrid = await probeDisplayImageUrl(gridUrl, thumbProbeController.signal)
  if (!hasGrid) {
    storyUsesThumbFallback.value = true
    gridSpriteUrl.value = null
    return false
  }

  storyUsesThumbFallback.value = false
  gridSpriteUrl.value = gridUrl
  setCachedThumb(mediaThumbKey('videos', props.media.id, 'grids'), gridUrl)
  return true
}

const initFrames = async () => {
  const token = ++initFramesToken
  if (!isMounted.value || !props.media?.id || !isViewTimeline.value) return

  await getImg()
  if (token !== initFramesToken || !isViewTimeline.value) return
  await ensureGridSpriteLoaded()
}

watch(() => showTimelinePreview.value, (active) => {
  if (active) {
    void ensureGridSpriteLoaded()
  }
})

watch(showVideoPreview, (active) => {
  if (active) return
  resetHoverPreviewReady()
  stopPreviewLiveTranscode()
  releaseHoverVideoPreview(Number(props.media.id))
  abortVideoPlayback(videoRef.value)
})

// Наблюдатели
watch(
  () => showVideoPreview.value && videoRef.value,
  (ready) => {
    if (!ready) return
    if (hasFixedPreviewTime.value && props.previewStartTime != null) {
      void syncPreviewVideoPosition(props.previewStartTime)
    }
    // Playback is started by schedulePreviewPlayback after it mounts the element.
  },
)

watch(() => contextMenuStore.show, (show) => {
  if (show) return
  if (!bigPreviewMenuActive.value) return

  nextTick(() => {
    bigPreviewMenuActive.value = false
    const preview = getPreviewEl()
    if (preview && gridBigPreview.isVisual.value) {
      preview.style.zIndex = '3000'
    }
  })
})

watch(() => props.isFileExists, (exists) => {
  if (!exists) {
    clearTimeout(timeouts.cinema)
    if (hasActivePreviewState()) {
      stopPlayingPreview({force: true})
    }
    return
  }
  if (isThumbUnavailable(thumb.value)) {
    getImg()
  }
})

watch(playbackError, (error) => {
  if (!error) return
  clearTimeout(timeouts.cinema)
  clearTimeout(timeouts.z)
  previewPlaybackToken += 1
  allowHoverVideoElement.value = false
  resetHoverPreviewReady()
  stopPreviewLiveTranscode()
  abortVideoPlayback(videoRef.value)
  if (isBigPreviewOpen.value) {
    contextMenuStore.show = false
    bigPreviewMenuActive.value = false
    stopPlayingPreview()
  }
})

watch(() => itemsStore.thumbRefreshKeys[Number(props.media.id)], (version) => {
  if (version == null) return
  invalidateVideoThumbCaches(props.media.id)
  const shouldRegenerate = itemsStore.consumeThumbRegenerate(props.media.id)
  if (shouldRegenerate) {
    thumbCreateAttempted.value = false
    thumbFallbackStage.value = 0
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
  if (!gridSpriteUrl.value && storyUsesThumbFallback.value) {
    void initFrames()
  }
})

watch(bigPreviewSize, () => {
  const preview = getPreviewEl()
  if (!preview || !gridBigPreview.isVisual.value) return
  applyBigPreviewMetrics(preview)
})

watch(() => is_window_focused.value, (focused) => {
  if (!focused) {
    stopPlayingPreview({force: true})
  }
}, {flush: 'sync'})

// Обработчики событий
const handleUpdateVideoFrames: Handler = (event) => {
  const id = Number(event)
  if (Number(props.media.id) === id && isViewTimeline.value) {
    void initFrames()
  }
}

const requestThumb = () => {
  if (!props.previewActive) return
  if (thumbLoadStarted.value) return
  thumbLoadStarted.value = true
  void getImg()
}

watch(() => props.thumbUrl, (url) => {
  if (!usesExternalThumb.value) return
  thumb.value = url ?? null
}, {immediate: true})

watch(() => props.previewActive, (active) => {
  if (active) {
    requestThumb()
    void getImg()
    if (isViewTimeline.value) {
      void initFrames()
    }
    return
  }

  stopPlayingPreview({force: true})
  clearPreviewResources()
}, { immediate: true })

onMounted(async () => {
  isMounted.value = true
  await nextTick()
  if (props.previewActive) {
    requestThumb()
    void getImg()
  }
  eventBus.on('updateVideoFrames', handleUpdateVideoFrames)
})

onBeforeUnmount(() => {
  isMounted.value = false
  initFramesToken += 1
  stopPlayingPreview({force: true})
  eventBus.off('updateVideoFrames', handleUpdateVideoFrames)
  clearPreviewResources()

  for (const timeout in timeouts) {
    clearTimeout(timeouts[timeout])
  }

  releaseHoverVideoPreview(Number(props.media.id))
  abortVideoPlayback(videoRef.value)
})
</script>

<style>
.preview {
  position: relative;
}

.preview-unavailable-notice {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  box-sizing: border-box;
  background: rgba(11, 11, 11, 0.78);
  color: #e16363;
  text-align: center;
  font-size: 12px;
  line-height: 1.35;
  font-weight: 500;
  pointer-events: auto;
  cursor: pointer;
}

.big-preview-plug .v-card {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}
</style>