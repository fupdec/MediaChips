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
        v-if="showThumbImage"
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
        @dblclick.stop="handlePreviewDblClick"
        @contextmenu="handlePreviewContextMenu"
        @mousedown="handlePreviewMouseDown"
        @mouseleave="handleMouseLeave"
        @mousemove="onPreviewMouseMove"
        @mouseenter="handleMouseEnter"
      >
      <v-img
        v-if="showThumbImage"
        :key="thumbDisplayKey"
        :aspect-ratio="gridBigPreview.isVisual.value ? undefined : 16 / 9"
        :src="thumb || undefined"
        class="thumb"
        :contain="!isCompactHost && !gridBigPreview.isVisual.value"
        :cover="isCompactHost || gridBigPreview.isVisual.value"
        @click.stop="handleMediaClick"
        @dblclick.stop="handlePreviewDblClick"
        @load="onThumbLoad"
        @error="onThumbError"
      />
      <div
        v-else
        class="thumb thumb--placeholder"
        aria-hidden="true"
      />

      <div
        v-if="showEmbeddedPlayHint"
        class="embedded-play-hint"
      >
        <v-icon color="white" size="48">mdi-play</v-icon>
      </div>

      <div v-if="!isCompactHost && !isImageOnlyView" class="duration">{{ duration }}</div>

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
        @dblclick.stop="handlePreviewDblClick"
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
        @dblclick.stop="handlePreviewDblClick"
        @contextmenu="handlePreviewContextMenu"
      >
        <video
          ref="videoRef"
          :muted="muted"
          loop
          playsinline
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
        @dblclick.stop="handlePreviewDblClick"
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
        @dblclick.stop="handlePreviewDblClick"
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
import {ref, computed} from 'vue'
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
import {setNotification} from '@/services/notificationService'
import {setOption} from '@/services/settingsService'
import {isImageOnlyItemsView} from '@/utils/itemsView'
import {buildVideoGridTaskParams} from '@shared/videoPreview'
import {useHoverPreviewPlayback} from '@/composable/useHoverPreviewPlayback'
import {useItemPreviewBigPreviewSession} from '@/composable/useItemPreviewBigPreviewSession'
import {useItemPreviewCardActions} from '@/composable/useItemPreviewCardActions'
import {useItemPreviewContextMenu} from '@/composable/useItemPreviewContextMenu'
import {useItemPreviewDisplay} from '@/composable/useItemPreviewDisplay'
import {useItemPreviewHoverSession} from '@/composable/useItemPreviewHoverSession'
import {useItemPreviewLifecycle} from '@/composable/useItemPreviewLifecycle'
import {useItemPreviewTimelineFrames} from '@/composable/useItemPreviewTimelineFrames'
import {useVideoBigPreview} from '@/composable/useVideoBigPreview'
import {useVideoPreviewThumb} from '@/composable/useVideoPreviewThumb'
import type {MediaItem} from '@/types/stores'
import type {HoverSessionTimeoutMap} from '@/composable/useItemPreviewHoverSession'

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

const emit = defineEmits<{
  'update-big-preview': [value: boolean]
}>()

const store = useAppStore()
const itemsStore = useItemsStore()
const settingsStore = useSettingsStore()
const tasksStore = useTasksStore()
const contextMenuStore = useContextMenu()
const eventBus = useEventBus()
const listSync = useItemsListSync()
const {t} = useI18n()
const gridBigPreview = useVideoBigPreview()

const hasFixedPreviewTime = computed(() => props.previewStartTime != null)
const isEmbeddedHost = computed(() => props.previewHost === 'embedded')
const isCompactHost = computed(() => props.previewHost === 'compact')
const isImageOnlyView = computed(() => isImageOnlyItemsView(itemsStore.view))
const isViewCard = computed(() =>
  isEmbeddedHost.value || isCompactHost.value || Number(itemsStore.view) === 1 || isImageOnlyView.value,
)
const isViewTimeline = computed(() =>
  !isEmbeddedHost.value && Number(itemsStore.view) === 2,
)

const isMounted = ref(false)
let initTimelineFrames: () => Promise<void> = async () => {}

const {
  thumb,
  thumbDisplayKey,
  pauseOffscreenThumb,
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

/** Mount VImg only in-viewport — keeps card shell size, drops decoded bitmaps offscreen. */
const showThumbImage = computed(() => props.previewActive && Boolean(thumb.value))

const previewRef = ref<ComponentPublicInstance | null>(null)
const cardAnchorRef = ref<HTMLElement | null>(null)
const storyRef = ref<HTMLElement | null>(null)
const storyWrapperRef = ref<HTMLElement | null>(null)
const isHovered = ref(false)
const timeouts: HoverSessionTimeoutMap = {}
const isShrinking = ref(false)

const getPreviewEl = (): HTMLElement | null => {
  const instance = previewRef.value
  return (instance?.$el as HTMLElement | undefined) ?? null
}

const mediaWidth = computed(() => Number(props.media.width) || 0)
const mediaHeight = computed(() => Number(props.media.height) || 0)
const mediaDuration = computed(() => Number(props.media.duration) || 0)
const isTaskRunning = computed(() =>
  tasksStore.list.find(task => task.key === 'generating_grid_images'),
)

const {
  videoRef,
  progress,
  playbackTime,
  playbackError,
  allowHoverVideoElement,
  hoverPreviewReady,
  hoverPreviewPending,
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
  isVideoPreviewEnabled: () => settingsStore.videoPreviewHover === 'video',
  mediaWidth: () => mediaWidth.value,
  mediaHeight: () => mediaHeight.value,
  isContextMenuOpen: () => contextMenuStore.show,
  hidePreviewVideoImmediately,
  pausePreviewVideoOnly,
  onBigPreviewChange: (open) => emit('update-big-preview', open),
})

const {
  handleMouseEnter,
  handleMouseMove,
  handleMouseLeave,
  stopPlayingPreview,
} = useItemPreviewHoverSession({
  mediaId: () => Number(props.media.id),
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
  isHoverVideoArmed: () => allowHoverVideoElement.value,
  hoverPreviewReady,
  isBigPreviewOpen,
  onBigPreviewChange: (open) => emit('update-big-preview', open),
  clearContextMenu: () => {
    contextMenuStore.show = false
  },
})

const onPreviewMouseMove = (e: MouseEvent) => {
  handleMouseMove(e)
  changePreviewTime(e)
}

const {
  muted,
  bigPreviewSize,
  quality,
  height,
  duration,
  mediaAspectRatio,
  showVideoPreview,
  showTimelinePreview,
  showPreviewUnavailableNotice,
  previewAppearStyle,
  showCardAnchor,
  useBigPreviewPortal,
  hostClasses,
  previewContainerClasses,
  showEmbeddedPlayHint,
  showPlaybackTimeline,
  playbackTimelinePercent,
  playbackTimelineTimeLabel,
} = useItemPreviewDisplay({
  previewHost: () => props.previewHost,
  isFileExists: () => props.isFileExists,
  isEmbeddedHost: () => isEmbeddedHost.value,
  isViewCard: () => isViewCard.value,
  videoPreviewHover: () => settingsStore.videoPreviewHover,
  playSoundOnVideoPreview: () => settingsStore.play_sound_on_video_preview,
  bigVideoPreviewSize: () => settingsStore.big_video_preview_size,
  delayVideoPreview: () => settingsStore.delayVideoPreview,
  mediaWidth: () => mediaWidth.value,
  mediaHeight: () => mediaHeight.value,
  mediaDuration: () => mediaDuration.value,
  progress: () => progress.value,
  playbackTime: () => playbackTime.value,
  playbackError: () => playbackError.value,
  isHovered: () => isHovered.value,
  isShrinking: () => isShrinking.value,
  hoverPreviewReady: () => hoverPreviewReady.value,
  hoverPreviewPending: () => hoverPreviewPending.value,
  allowHoverVideoElement: () => allowHoverVideoElement.value,
  holdPreviewVideoDuringCollapse: () => holdPreviewVideoDuringCollapse.value,
  collapsePreviewFading: () => collapsePreviewFading.value,
  bigPreviewAnimation: () => bigPreviewAnimation.value,
  isBigPreviewOpen: () => isBigPreviewOpen.value,
  gridBigPreview,
})

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
  itemsView: () => itemsStore.view,
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
  // Keep the last thumb URL mounted — clearing it mid-load trips a Vuetify VImg bug.
  pauseOffscreenThumb()
  clearTimelineFrames()
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
  playSoundOnVideoPreview: () => settingsStore.play_sound_on_video_preview,
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

const {
  handlePreviewClick,
  handleMediaClick,
  handlePreviewDblClick,
  handlePreviewBlur,
  play,
  restartImageGeneration,
} = useItemPreviewCardActions({
  media: () => props.media,
  playTime: () => props.playTime,
  isShrinking: () => isShrinking.value,
  isBigPreviewOpen: () => isBigPreviewOpen.value,
  gridBigPreview,
  bigPreviewMenuActive,
  stopPlayingPreview,
  clearContextMenu: () => {
    contextMenuStore.show = false
  },
  playVideo: (payload) => itemsStore.playVideo(payload),
  syncMediaItem: (mediaId) => {
    listSync.getItemsFromDb({ids: [mediaId], type: 'media'})
  },
})

useItemPreviewLifecycle({
  mediaId: () => Number(props.media.id),
  previewActive: () => props.previewActive,
  isFileExists: () => props.isFileExists,
  isWindowFocused: () => store.window.focused,
  isHovered: () => isHovered.value,
  isMounted,
  thumb: () => thumb.value,
  videoRef,
  playbackError,
  bigPreviewSize: () => bigPreviewSize.value,
  bigPreviewAnimation,
  bigPreviewMenuActive,
  timeouts,
  gridBigPreview,
  hasFixedPreviewTime: () => hasFixedPreviewTime.value,
  previewStartTime: () => props.previewStartTime,
  showVideoPreview: () => showVideoPreview.value,
  isBigPreviewOpen: () => isBigPreviewOpen.value,
  isContextMenuOpen: () => contextMenuStore.show,
  getPreviewEl,
  clearCinemaTimeout,
  resetBigPreviewOpen,
  applyBigPreviewMetrics,
  syncPreviewVideoPosition,
  teardownWhenPreviewHidden,
  invalidateOnPlaybackError,
  stopPlayingPreview,
  hasActivePreviewState,
  requestThumb,
  getImg,
  clearPreviewResources,
  clearContextMenu: () => {
    contextMenuStore.show = false
  },
})
</script>

<style>
.preview {
  position: relative;
}

.thumb--placeholder {
  width: 100%;
  height: 100%;
  aspect-ratio: 16 / 9;
  background-color: #7878782b;
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
