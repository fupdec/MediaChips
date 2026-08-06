import {computed, toValue, type MaybeRefOrGetter} from 'vue'
import {
  BIG_PREVIEW_SIZE_CLASSES,
  normalizeBigPreviewSize,
  type BigVideoPreviewSize,
} from '@/composable/useItemPreviewBigPreviewSession'
import type {useVideoBigPreview} from '@/composable/useVideoBigPreview'
import {
  getReadableDuration,
  getReadableVideoHeight,
  getReadableVideoQuality,
} from '@/services/formatUtils'
import {getMediaAspectRatio} from '@/utils/gridLayout'

export type PreviewHost = 'grid' | 'embedded' | 'compact'

export type PreviewContainerClassesInput = {
  isHovered: boolean
  isBigPreviewActive: boolean
  isBigPreviewCollapsing: boolean
  isShrinking: boolean
  showVideoPreview: boolean
  showTimelinePreview: boolean
  hoverPreviewReady: boolean
  /** Mounted and seeking — hide <video> so t≈0 never shows; leave must NOT set this. */
  hoverPreviewPending: boolean
  isFullscreenBigPreview: boolean
  isVideoPreviewEnabled: boolean
  isGridExpanding: boolean
  isGridCollapsing: boolean
  collapsePreviewFading: boolean
  bigPreviewSize: BigVideoPreviewSize
}

export function buildPreviewHostClasses(
  previewHost: PreviewHost,
  isFileExists: boolean,
): Array<string | Record<string, boolean>> {
  return [
    'video-preview-host',
    `video-preview-host--${previewHost}`,
    {'no-file': !isFileExists},
  ]
}

export function buildPreviewContainerClasses(
  input: PreviewContainerClassesInput,
): Record<string, boolean> {
  const classes: Record<string, boolean> = {
    'is-hovered': input.isHovered ||
      input.isBigPreviewActive ||
      input.isBigPreviewCollapsing ||
      input.isShrinking,
    'is-preview-active': input.showVideoPreview || input.showTimelinePreview,
    'is-hover-preview-ready': input.hoverPreviewReady && !input.isFullscreenBigPreview,
    'is-hover-preview-pending': input.hoverPreviewPending && !input.isFullscreenBigPreview,
    'is-video-preview-enabled': input.isVideoPreviewEnabled,
    'video-preview-container--expanded': input.isFullscreenBigPreview,
    'video-preview-container--expanding': input.isGridExpanding,
    'video-preview-container--collapsing': input.isGridCollapsing,
    'video-preview-container--preview-fading':
      input.isGridCollapsing && input.collapsePreviewFading,
  }

  if (input.isFullscreenBigPreview && !input.isGridCollapsing) {
    classes[BIG_PREVIEW_SIZE_CLASSES[input.bigPreviewSize]] = true
  }

  return classes
}

export function getProgressPosition(progress: number, duration: number): string {
  if (!duration) return '100%'
  return `${100 - (progress / duration) * 100}%`
}

export function getPlaybackTimelinePercent(playbackTime: number, duration: number): number {
  if (!duration) return 0
  return Math.min(100, Math.max(0, (playbackTime / duration) * 100))
}

export type ItemPreviewDisplayOptions = {
  previewHost: MaybeRefOrGetter<PreviewHost>
  isFileExists: MaybeRefOrGetter<boolean>
  isEmbeddedHost: MaybeRefOrGetter<boolean>
  isViewCard: MaybeRefOrGetter<boolean>
  videoPreviewHover: MaybeRefOrGetter<string>
  playSoundOnVideoPreview: MaybeRefOrGetter<string>
  bigVideoPreviewSize: MaybeRefOrGetter<string | undefined>
  delayVideoPreview: MaybeRefOrGetter<string | number | undefined>
  mediaWidth: MaybeRefOrGetter<number>
  mediaHeight: MaybeRefOrGetter<number>
  mediaDuration: MaybeRefOrGetter<number>
  progress: MaybeRefOrGetter<number>
  playbackTime: MaybeRefOrGetter<number>
  playbackError: MaybeRefOrGetter<boolean>
  isHovered: MaybeRefOrGetter<boolean>
  isShrinking: MaybeRefOrGetter<boolean>
  hoverPreviewReady: MaybeRefOrGetter<boolean>
  /** True while mounted and still seeking to the scrub frame (hide <video>). */
  hoverPreviewPending: MaybeRefOrGetter<boolean>
  allowHoverVideoElement: MaybeRefOrGetter<boolean>
  holdPreviewVideoDuringCollapse: MaybeRefOrGetter<boolean>
  collapsePreviewFading: MaybeRefOrGetter<boolean>
  bigPreviewAnimation: MaybeRefOrGetter<boolean>
  isBigPreviewOpen: MaybeRefOrGetter<boolean>
  gridBigPreview: ReturnType<typeof useVideoBigPreview>
}

export function useItemPreviewDisplay(options: ItemPreviewDisplayOptions) {
  const isVideoPreviewEnabled = computed(() =>
    toValue(options.videoPreviewHover) === 'video',
  )

  const muted = computed(() => toValue(options.playSoundOnVideoPreview) !== '1')

  const bigPreviewSize = computed(() =>
    normalizeBigPreviewSize(toValue(options.bigVideoPreviewSize)),
  )

  const quality = computed(() =>
    getReadableVideoQuality(toValue(options.mediaWidth), toValue(options.mediaHeight)),
  )

  const height = computed(() =>
    getReadableVideoHeight(toValue(options.mediaWidth), toValue(options.mediaHeight)),
  )

  const duration = computed(() =>
    getReadableDuration(toValue(options.mediaDuration)),
  )

  const mediaAspectRatio = computed(() =>
    getMediaAspectRatio({
      width: toValue(options.mediaWidth),
      height: toValue(options.mediaHeight),
    }, 16 / 9),
  )

  const progressPosition = computed(() =>
    getProgressPosition(toValue(options.progress), toValue(options.mediaDuration)),
  )

  const showVideoPreview = computed(() =>
    toValue(options.videoPreviewHover) === 'video' &&
    toValue(options.isFileExists) &&
    (
      toValue(options.allowHoverVideoElement) ||
      options.gridBigPreview.isVisual.value ||
      toValue(options.holdPreviewVideoDuringCollapse)
    ) &&
    !toValue(options.isShrinking),
  )

  const showTimelinePreview = computed(() =>
    toValue(options.videoPreviewHover) === 'timeline' &&
    toValue(options.isFileExists) &&
    toValue(options.isHovered) &&
    !toValue(options.isShrinking),
  )

  const showPreviewUnavailableNotice = computed(() =>
    toValue(options.playbackError) && toValue(options.isViewCard) && toValue(options.isHovered),
  )

  const isShowProgress = computed(() =>
    toValue(options.videoPreviewHover) === 'video' &&
    toValue(options.isFileExists) &&
    toValue(options.isHovered) &&
    !toValue(options.playbackError),
  )

  const previewAppearStyle = computed(() => {
    const delay = Math.max(0, Number(toValue(options.delayVideoPreview)) || 0)
    return {
      '--preview-appear-delay': `${delay}ms`,
    }
  })

  const showCardAnchor = computed(() =>
    options.gridBigPreview.isVisual.value || toValue(options.bigPreviewAnimation),
  )

  const useBigPreviewPortal = computed(() => options.gridBigPreview.isPortaled.value)

  const hostClasses = computed(() =>
    buildPreviewHostClasses(toValue(options.previewHost), toValue(options.isFileExists)),
  )

  const previewContainerClasses = computed(() =>
    buildPreviewContainerClasses({
      isHovered: toValue(options.isHovered),
      isBigPreviewActive: options.gridBigPreview.isActive.value,
      isBigPreviewCollapsing: options.gridBigPreview.isCollapsing.value,
      isShrinking: toValue(options.isShrinking),
      showVideoPreview: showVideoPreview.value,
      showTimelinePreview: showTimelinePreview.value,
      hoverPreviewReady: toValue(options.hoverPreviewReady),
      hoverPreviewPending: toValue(options.hoverPreviewPending),
      isFullscreenBigPreview: options.gridBigPreview.isVisual.value,
      isVideoPreviewEnabled: isVideoPreviewEnabled.value,
      isGridExpanding: options.gridBigPreview.isExpanding.value,
      isGridCollapsing: options.gridBigPreview.isCollapsing.value,
      collapsePreviewFading: toValue(options.collapsePreviewFading),
      bigPreviewSize: bigPreviewSize.value,
    }),
  )

  const showEmbeddedPlayHint = computed(() =>
    toValue(options.isEmbeddedHost) &&
    toValue(options.isFileExists) &&
    toValue(options.isHovered) &&
    !options.gridBigPreview.isExpanded.value &&
    !options.gridBigPreview.isCollapsing.value &&
    !toValue(options.isShrinking) &&
    !showVideoPreview.value &&
    !showTimelinePreview.value &&
    !showPreviewUnavailableNotice.value,
  )

  const showPlaybackTimeline = computed(() =>
    toValue(options.isFileExists) &&
    showVideoPreview.value &&
    !toValue(options.playbackError) &&
    toValue(options.mediaDuration) > 0 &&
    (toValue(options.isEmbeddedHost) || toValue(options.isBigPreviewOpen)),
  )

  const playbackTimelinePercent = computed(() =>
    getPlaybackTimelinePercent(
      toValue(options.playbackTime),
      toValue(options.mediaDuration),
    ),
  )

  const playbackTimelineTimeLabel = computed(() => {
    const current = getReadableDuration(Math.floor(toValue(options.playbackTime)))
    return `${current} / ${duration.value}`
  })

  return {
    isVideoPreviewEnabled,
    muted,
    bigPreviewSize,
    quality,
    height,
    duration,
    mediaAspectRatio,
    progressPosition,
    showVideoPreview,
    showTimelinePreview,
    showPreviewUnavailableNotice,
    isShowProgress,
    previewAppearStyle,
    showCardAnchor,
    useBigPreviewPortal,
    hostClasses,
    previewContainerClasses,
    showEmbeddedPlayHint,
    showPlaybackTimeline,
    playbackTimelinePercent,
    playbackTimelineTimeLabel,
  }
}
