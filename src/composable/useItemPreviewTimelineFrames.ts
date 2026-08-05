import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue'
import type {Handler} from 'mitt'
import {getReadableDuration} from '@/services/formatUtils'
import {mediaThumbKey, setCachedThumb} from '@/utils/thumbDisplayCache'
import {
  GRID_FRAME_INDEXES,
  buildContainedThumbFallbackStyle,
  buildGridSpriteFrameStyle,
  buildStoryGridSpriteFrameStyle,
  buildStoryThumbFallbackStyle,
  getGridFramePercent,
} from '@/utils/gridSprite'
import {resolveGridSpriteDisplayUrl} from '@/utils/thumbSource'
import type {MediaItem} from '@/types/stores'

export function getGridFrameDurationLabel(
  frameIndex: number,
  mediaDuration: number,
  fallbackDurationLabel: string,
): string {
  if (!mediaDuration) {
    return fallbackDurationLabel
  }

  const percent = getGridFramePercent(frameIndex)
  return getReadableDuration(Math.floor(mediaDuration * percent / 100))
}

export function shouldShowFramesInProgressMessage(
  isFileExists: boolean,
  storyUsesThumbFallback: boolean,
  isTaskRunning: boolean,
): boolean {
  return isFileExists && storyUsesThumbFallback && isTaskRunning
}

export function computeStoryScrollOffset(
  layerX: number,
  storyWidth: number,
  wrapperWidth: number,
): number | null {
  if (wrapperWidth <= storyWidth) return null

  const ratio = storyWidth / (wrapperWidth - storyWidth)
  return Math.ceil(layerX / ratio)
}

export type ItemPreviewTimelineFramesOptions = {
  media: MaybeRefOrGetter<MediaItem>
  isFileExists: MaybeRefOrGetter<boolean>
  isMounted: MaybeRefOrGetter<boolean>
  isViewTimeline: MaybeRefOrGetter<boolean>
  showTimelinePreview: MaybeRefOrGetter<boolean>
  mediaDuration: MaybeRefOrGetter<number>
  durationLabel: MaybeRefOrGetter<string>
  mediaAspectRatio: MaybeRefOrGetter<number>
  isTaskRunning: MaybeRefOrGetter<unknown>
  mediaPath: MaybeRefOrGetter<string>
  itemsView: MaybeRefOrGetter<number | string>
  previewActive: MaybeRefOrGetter<boolean>
  thumb: MaybeRefOrGetter<string | null | undefined>
  resolveThumbFallback: () => string | null | undefined
  getImg: () => Promise<void>
  runImageProbe: (url: string) => Promise<boolean>
  getStoryEl: () => HTMLElement | null
  getStoryWrapperEl: () => HTMLElement | null
  onUpdateVideoFrames?: (handler: Handler) => void
  offUpdateVideoFrames?: (handler: Handler) => void
  onViewLeaveTimeline?: () => void
}

export function useItemPreviewTimelineFrames(options: ItemPreviewTimelineFramesOptions) {
  const hoverFrameIndex = ref(0)
  const gridSpriteUrl = ref<string | null>(null)
  const storyUsesThumbFallback = ref(false)

  let initFramesToken = 0

  const clearTimelineFrames = () => {
    initFramesToken += 1
    gridSpriteUrl.value = null
    hoverFrameIndex.value = 0
    storyUsesThumbFallback.value = false
  }

  const getGridFrameDuration = (frameIndex: number) =>
    getGridFrameDurationLabel(
      frameIndex,
      toValue(options.mediaDuration),
      toValue(options.durationLabel),
    )

  const hoverGridFrameStyle = computed(() => {
    const thumbFallback = options.resolveThumbFallback()

    if (storyUsesThumbFallback.value && thumbFallback) {
      return buildContainedThumbFallbackStyle(thumbFallback, toValue(options.mediaAspectRatio))
    }

    if (!gridSpriteUrl.value) return null
    return buildGridSpriteFrameStyle(
      gridSpriteUrl.value,
      hoverFrameIndex.value,
      toValue(options.mediaAspectRatio),
    )
  })

  const storyFrameStyles = computed(() => {
    const spriteUrl = gridSpriteUrl.value
    const thumbFallback = options.resolveThumbFallback()

    return GRID_FRAME_INDEXES.map((frameIndex) => {
      if (storyUsesThumbFallback.value && thumbFallback) {
        return buildStoryThumbFallbackStyle(thumbFallback, toValue(options.mediaAspectRatio))
      }

      if (!spriteUrl) return null
      return buildStoryGridSpriteFrameStyle(spriteUrl, frameIndex, toValue(options.mediaAspectRatio))
    })
  })

  const isFrameLost = computed(() => !hoverGridFrameStyle.value)

  const showFramesInProgressMessage = computed(() =>
    shouldShowFramesInProgressMessage(
      toValue(options.isFileExists),
      storyUsesThumbFallback.value,
      Boolean(toValue(options.isTaskRunning)),
    ),
  )

  const setHoverFrameIndex = (frameIndex: number) => {
    hoverFrameIndex.value = frameIndex
  }

  const scrollStory = (e: MouseEvent) => {
    const storyEl = options.getStoryEl()
    const wrapperEl = options.getStoryWrapperEl()
    if (!storyEl || !wrapperEl) return

    const offset = computeStoryScrollOffset(
      e.layerX,
      storyEl.clientWidth,
      wrapperEl.clientWidth,
    )
    if (offset == null) return

    wrapperEl.style.left = `-${offset}px`
  }

  const stopScrollStory = () => {
    const wrapperEl = options.getStoryWrapperEl()
    if (wrapperEl) {
      wrapperEl.style.left = '0'
    }
  }

  const ensureGridSpriteLoaded = async () => {
    const media = toValue(options.media)
    if (!media?.id) return false

    const gridUrl = resolveGridSpriteDisplayUrl(toValue(options.mediaPath), media.id)
    if (!gridUrl) {
      storyUsesThumbFallback.value = true
      gridSpriteUrl.value = null
      return false
    }

    const hasGrid = await options.runImageProbe(gridUrl)
    if (!hasGrid) {
      storyUsesThumbFallback.value = true
      gridSpriteUrl.value = null
      return false
    }

    storyUsesThumbFallback.value = false
    gridSpriteUrl.value = gridUrl
    setCachedThumb(mediaThumbKey('videos', media.id, 'grids'), gridUrl)
    return true
  }

  const initFrames = async () => {
    const token = ++initFramesToken
    if (!toValue(options.isMounted) || !toValue(options.media)?.id || !toValue(options.isViewTimeline)) {
      return
    }

    await options.getImg()
    if (token !== initFramesToken || !toValue(options.isViewTimeline)) return
    await ensureGridSpriteLoaded()
  }

  const handleUpdateVideoFrames: Handler = (event) => {
    const id = Number(event)
    if (Number(toValue(options.media).id) === id && toValue(options.isViewTimeline)) {
      void initFrames()
    }
  }

  watch(() => toValue(options.showTimelinePreview), (active) => {
    if (active) {
      void ensureGridSpriteLoaded()
    }
  })

  watch(() => toValue(options.itemsView), (value) => {
    if (Number(value) === 2) {
      void initFrames()
      return
    }

    initFramesToken += 1
    options.onViewLeaveTimeline?.()
  })

  watch(() => toValue(options.isTaskRunning), (running, wasRunning) => {
    if (wasRunning && !running && toValue(options.isViewTimeline)) {
      void initFrames()
    }
  })

  watch(() => toValue(options.thumb), () => {
    if (!toValue(options.isViewTimeline)) return
    if (!gridSpriteUrl.value && storyUsesThumbFallback.value) {
      void initFrames()
    }
  })

  watch(() => toValue(options.previewActive), (active) => {
    if (active) {
      if (toValue(options.isViewTimeline)) {
        void initFrames()
      }
      return
    }

    clearTimelineFrames()
  })

  onMounted(() => {
    options.onUpdateVideoFrames?.(handleUpdateVideoFrames)
  })

  onBeforeUnmount(() => {
    options.offUpdateVideoFrames?.(handleUpdateVideoFrames)
    clearTimelineFrames()
  })

  return {
    hoverFrameIndex,
    gridSpriteUrl,
    storyUsesThumbFallback,
    getGridFrameDuration,
    hoverGridFrameStyle,
    storyFrameStyles,
    isFrameLost,
    showFramesInProgressMessage,
    setHoverFrameIndex,
    scrollStory,
    stopScrollStory,
    ensureGridSpriteLoaded,
    initFrames,
    clearTimelineFrames,
  }
}
