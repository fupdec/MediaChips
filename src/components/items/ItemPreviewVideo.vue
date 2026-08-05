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
        @mousedown="handlePreviewMouseDown"
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

      <div v-if="!isCompactHost && !isImageOnlyView" class="duration">{{ duration }}</div>

      <div
        v-if="!isCompactHost && !isImageOnlyView && isShowProgress && !playbackError && !showPlaybackTimeline"
        :style="{ right: progressPosition }"
        class="progress"
      />

      <div v-if="!isCompactHost && !isImageOnlyView" class="resolution">
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
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useTasksStore} from '@/stores/tasks'
import {useContextMenu} from '@/stores/contextMenu'
import {useEventBus} from '@/utils/eventBus'
import {useItemsListSync} from '@/composable/itemsListSync'
import {typedApi} from '@/services/typedApi'
import {invalidateVideoThumbCaches} from '@/utils/thumbDisplayCache'
import {GRID_FRAME_INDEXES} from '@/utils/gridSprite'
import {getMediaAspectRatio} from '@/utils/gridLayout'
import {isThumbUnavailable} from '@/utils/thumbSource'
import {
  getReadableDuration,
  getReadableVideoHeight,
  getReadableVideoQuality,
} from '@/services/formatUtils'
import {setNotification} from '@/services/notificationService'
import {setOption} from '@/services/settingsService'
import {releaseHoverVideoPreview} from '@/utils/hoverPreviewSession'
import {abortVideoPlayback} from '@/utils/liveTranscodeLifecycle'
import {isImageOnlyItemsView} from '@/utils/itemsView'
import {buildVideoGridTaskParams} from '@shared/videoPreview'
import {useHoverPreviewPlayback} from '@/composable/useHoverPreviewPlayback'
import {
  BIG_PREVIEW_SIZE_CLASSES,
  useItemPreviewBigPreviewSession,
  type BigVideoPreviewSize,
} from '@/composable/useItemPreviewBigPreviewSession'
import {useItemPreviewContextMenu} from '@/composable/useItemPreviewContextMenu'
import {useItemPreviewHoverSession} from '@/composable/useItemPreviewHoverSession'
import {useItemPreviewTimelineFrames} from '@/composable/useItemPreviewTimelineFrames'
import {useVideoBigPreview} from '@/composable/useVideoBigPreview'
import {useVideoPreviewThumb} from '@/composable/useVideoPreviewThumb'
import {useBrowserLayout} from '@/composable/useBrowserLayout'
import type {MediaItem} from '@/types/stores'

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
  leave?: ReturnType<typeof setTimeout>
  hoverCooldown?: ReturnType<typeof setTimeout>
  contextMenuGuard?: ReturnType<typeof setTimeout>
}

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
  activate: []
}>()

// store
const store = useAppStore()
const itemsStore = useItemsStore()
const settingsStore = useSettingsStore()
const tasksStore = useTasksStore()
const contextMenuStore = useContextMenu()
const eventBus = useEventBus()
const listSync = useItemsListSync()
const {t} = useI18n()
const gridBigPreview = useVideoBigPreview()
const {useBrowserLayout: browserLayoutActive} = useBrowserLayout()

const ITEMS = computed(() => itemsStore)
const isImageOnlyView = computed(() => isImageOnlyItemsView(ITEMS.value.view))
const isViewCard = computed(() =>
  isEmbeddedHost.value || isCompactHost.value || Number(ITEMS.value.view) === 1 || isImageOnlyView.value,
)
const isViewTimeline = computed(() =>
  !isEmbeddedHost.value && Number(ITEMS.value.view) === 2,
)

const isMounted = ref(false)

let initTimelineFrames: () => Promise<void> = async () => {}

const {
  thumb,
  thumbDisplayKey,
  usesExternalThumb,
  clearThumbState,
  resolveThumbFallback,
  getStaticPreviewSubfolder,
  onThumbLoad,
  onThumbError,
  loadThumb,
  getImg,
  requestThumb,
  runImageProbe,
} = useVideoPreviewThumb({
  media: () => props.media,
  previewActive: () => props.previewActive,
  isFileExists: () => props.isFileExists,
  thumbUrl: () => props.thumbUrl,
  isViewCard: () => isViewCard.value,
  isEmbeddedHost: () => isEmbeddedHost.value,
  isMounted: () => isMounted.value,
  mediaPath: () => store.mediaPath,
  onThumbRefreshed: () => {
    if (isViewTimeline.value) {
      void initTimelineFrames()
    }
  },
})

const previewRef = ref<ComponentPublicInstance | null>(null)
const cardAnchorRef = ref<HTMLElement | null>(null)
const storyRef = ref<HTMLElement | null>(null)
const storyWrapperRef = ref<HTMLElement | null>(null)

const isHovered = ref(false)

const timeouts: TimeoutMap = {}
const isShrinking = ref(false)

const getPreviewEl = (): HTMLElement | null => {
  const instance = previewRef.value
  return (instance?.$el as HTMLElement | undefined) ?? null
}

const mediaWidth = computed(() => Number(props.media.width) || 0)
const mediaHeight = computed(() => Number(props.media.height) || 0)
const mediaDuration = computed(() => Number(props.media.duration) || 0)

const SETTINGS = computed(() => settingsStore)

const {
  videoRef,
  progress,
  playbackTime,
  playbackError,
  allowHoverVideoElement,
  hoverPreviewReady,
  changePreviewTime,
  handleVideoError,
  handleVideoLoaded,
  handleVideoTimeUpdate,
  applyPreviewTimeFromPointer,
  applyFixedPreviewTime,
  scheduleHoverPreviewUi,
  syncPreviewVideoPosition,
  hidePreviewVideoImmediately,
  finalizePreviewStop,
  cancelHoverPlayback,
  clearPreviewDelayTimer,
  stopPreviewLiveTranscode,
  teardownWhenPreviewHidden,
  invalidateOnPlaybackError,
} = useHoverPreviewPlayback({
  mediaId: () => Number(props.media.id),
  mediaDuration: () => mediaDuration.value,
  isFileExists: () => props.isFileExists,
  previewStartTime: () => props.previewStartTime,
  previewEndTime: () => props.previewEndTime,
  hasFixedPreviewTime: () => hasFixedPreviewTime.value,
  isHovered: () => isHovered.value,
  isPreviewVisible: () => showVideoPreview.value,
  getPreviewEl,
  showPlaybackTimeline: () => showPlaybackTimeline.value,
  isBigPreviewVisual: () => gridBigPreview.isVisual.value,
  onHoverPreviewReady: () => scheduleBigPreviewAfterHoverReady(),
})

const pausePreviewVideoOnly = () => {
  if (videoRef.value) {
    try {
      videoRef.value.pause()
    } catch (error) {
      console.error(error)
    }
  }
}

const isVideoPreviewEnabled = computed(() =>
  SETTINGS.value.videoPreviewHover === 'video',
)

const {
  bigPreviewAnimation,
  bigPreviewMenuActive,
  holdPreviewVideoDuringCollapse,
  collapsePreviewFading,
  isBigPreviewOpen,
  clearCinemaTimeout,
  scheduleBigPreviewAfterHoverReady,
  closeGridBigPreview,
  resetBigPreviewOpen,
  resetPreviewContainer,
  applyBigPreviewMetrics,
  shouldKeepBigPreviewOpen,
  hasActivePreviewState,
} = useItemPreviewBigPreviewSession({
  gridBigPreview,
  getPreviewEl,
  getCardAnchorEl: () => cardAnchorRef.value,
  isHovered: () => isHovered.value,
  isShrinking: () => isShrinking.value,
  isFileExists: () => props.isFileExists,
  playbackError: () => playbackError.value,
  hoverPreviewReady: () => hoverPreviewReady.value,
  isVideoPreviewEnabled: () => isVideoPreviewEnabled.value,
  mediaWidth: () => mediaWidth.value,
  mediaHeight: () => mediaHeight.value,
  isContextMenuOpen: () => contextMenuStore.show,
  hidePreviewVideoImmediately,
  pausePreviewVideoOnly,
  onBigPreviewChange: (open) => emit('update-big-preview', open),
})

const {
  handleMouseEnter,
  handleMouseLeave,
  stopPlayingPreview,
} = useItemPreviewHoverSession({
  isFileExists: () => props.isFileExists,
  isHovered,
  isShrinking,
  playbackError,
  gridBigPreview,
  bigPreviewAnimation,
  bigPreviewMenuActive,
  holdPreviewVideoDuringCollapse,
  collapsePreviewFading,
  timeouts,
  hasFixedPreviewTime: () => hasFixedPreviewTime.value,
  getPreviewEl,
  clearCinemaTimeout,
  clearPreviewDelayTimer,
  cancelHoverPlayback,
  hidePreviewVideoImmediately,
  stopPreviewLiveTranscode,
  finalizePreviewStop,
  scheduleHoverPreviewUi,
  applyFixedPreviewTime,
  applyPreviewTimeFromPointer,
  closeGridBigPreview,
  resetPreviewContainer,
  shouldKeepBigPreviewOpen,
  hasActivePreviewState,
  isBigPreviewOpen,
  onBigPreviewChange: (open) => emit('update-big-preview', open),
  clearContextMenu: () => {
    contextMenuStore.show = false
  },
})

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

const progressPosition = computed(() => {
  const duration = mediaDuration.value
  if (!duration) return '100%'
  return `${100 - (progress.value / duration) * 100}%`
})

const showPreviewUnavailableNotice = computed(() =>
  playbackError.value && isViewCard.value && isHovered.value,
)

const isShowProgress = computed(() =>
  SETTINGS.value.videoPreviewHover === 'video' &&
  props.isFileExists &&
  isHovered.value &&
  !playbackError.value,
)

const is_window_focused = computed(() => store.window.focused)

const previewAppearStyle = computed(() => {
  const delay = Math.max(0, Number(SETTINGS.value.delayVideoPreview) || 0)
  return {
    '--preview-appear-delay': `${delay}ms`,
  }
})

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

const {
  getGridFrameDuration,
  hoverGridFrameStyle,
  storyFrameStyles,
  isFrameLost,
  showFramesInProgressMessage,
  setHoverFrameIndex,
  scrollStory,
  stopScrollStory,
  initFrames,
  clearTimelineFrames,
} = useItemPreviewTimelineFrames({
  media: () => props.media,
  isFileExists: () => props.isFileExists,
  isMounted: () => isMounted.value,
  isViewTimeline: () => isViewTimeline.value,
  showTimelinePreview: () => showTimelinePreview.value,
  mediaDuration: () => mediaDuration.value,
  durationLabel: () => duration.value,
  mediaAspectRatio: () => mediaAspectRatio.value,
  isTaskRunning: () => isTaskRunning.value,
  mediaPath: () => store.mediaPath,
  itemsView: () => ITEMS.value.view,
  previewActive: () => props.previewActive,
  thumb: () => thumb.value,
  resolveThumbFallback,
  getImg,
  runImageProbe,
  getStoryEl: () => storyRef.value,
  getStoryWrapperEl: () => storyWrapperRef.value,
  onUpdateVideoFrames: (handler) => eventBus.on('updateVideoFrames', handler),
  offUpdateVideoFrames: (handler) => eventBus.off('updateVideoFrames', handler),
  onViewLeaveTimeline: () => {
    void getImg()
  },
})

initTimelineFrames = initFrames

const clearPreviewResources = () => {
  clearThumbState()
  clearTimelineFrames()
}

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

// Модифицированные методы
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

const {
  handlePreviewContextMenu,
  handlePreviewMouseDown,
} = useItemPreviewContextMenu({
  media: () => props.media,
  isFileExists: () => props.isFileExists,
  gridBigPreview,
  bigPreviewMenuActive,
  bigPreviewSize: () => bigPreviewSize.value,
  muted: () => muted.value,
  playSoundOnVideoPreview: () => SETTINGS.value.play_sound_on_video_preview,
  videoRef,
  progress,
  timeouts,
  getPreviewEl,
  getStaticPreviewSubfolder,
  loadThumb,
  applyBigPreviewMetrics,
  mediaPath: () => store.mediaPath,
  translate: t,
  setOption,
  showContextMenu: (payload) => contextMenuStore.showContextMenu(payload),
  isContextMenuOpen: () => contextMenuStore.show,
  setNotification,
  refreshThumb: (mediaId, options) => itemsStore.refreshThumb(mediaId, options),
  syncMediaItem: (mediaId) => {
    listSync.getItemsFromDb({ids: [mediaId], type: 'media'})
  },
  refreshGridPreviewIfNeeded,
})

const handlePreviewClick = () => {
  if (gridBigPreview.isCollapsing.value || isShrinking.value) return
  if (gridBigPreview.isVisual.value) {
    // Clear keep-open flags so an earlier context menu cannot block dismiss.
    contextMenuStore.show = false
    bigPreviewMenuActive.value = false
    stopPlayingPreview()
    return
  }
  if (browserLayoutActive.value) {
    emit('activate')
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
  if (browserLayoutActive.value) {
    emit('activate')
    return
  }
  play()
}

const handlePreviewBlur = () => {
  if (isBigPreviewOpen.value) return
  stopPlayingPreview()
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

const restartImageGeneration = () => {
  listSync.getItemsFromDb({ids: [props.media.id], type: 'media'})
}

watch(showVideoPreview, (active) => {
  if (active) return
  teardownWhenPreviewHidden()
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
  if (show) {
    // Don't expand into big preview while any context menu is open.
    clearCinemaTimeout()
    clearTimeout(timeouts.leave)
    if (bigPreviewAnimation.value || gridBigPreview.isExpanding.value) {
      resetBigPreviewOpen()
    }
    return
  }
  if (!bigPreviewMenuActive.value) return

  nextTick(() => {
    bigPreviewMenuActive.value = false
    const preview = getPreviewEl()
    if (preview && gridBigPreview.isVisual.value) {
      preview.style.zIndex = '3000'
    }
    // If the pointer already left while the menu was open, finish dismiss now.
    if (!isHovered.value && gridBigPreview.isVisual.value) {
      stopPlayingPreview()
    }
  })
})

watch(() => props.isFileExists, (exists) => {
  if (!exists) {
    clearCinemaTimeout()
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
  clearCinemaTimeout()
  invalidateOnPlaybackError()
  if (isBigPreviewOpen.value) {
    contextMenuStore.show = false
    bigPreviewMenuActive.value = false
    stopPlayingPreview()
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

watch(() => props.previewActive, (active) => {
  if (active) {
    requestThumb()
    void getImg()
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
})

onBeforeUnmount(() => {
  isMounted.value = false
  stopPlayingPreview({force: true})
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