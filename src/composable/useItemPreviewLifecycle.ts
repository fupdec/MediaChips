import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  watch,
  type Ref,
  type MaybeRefOrGetter,
  toValue,
} from 'vue'
import type {useVideoBigPreview} from '@/composable/useVideoBigPreview'
import {isThumbUnavailable} from '@/utils/thumbSource'
import {releaseHoverVideoPreview} from '@/utils/hoverPreviewSession'
import {abortVideoPlayback} from '@/utils/liveTranscodeLifecycle'
import type {HoverSessionTimeoutMap} from '@/composable/useItemPreviewHoverSession'

export type ItemPreviewLifecycleOptions = {
  mediaId: MaybeRefOrGetter<number>
  previewActive: MaybeRefOrGetter<boolean>
  isFileExists: MaybeRefOrGetter<boolean>
  isWindowFocused: MaybeRefOrGetter<boolean>
  isHovered: MaybeRefOrGetter<boolean>
  isMounted: Ref<boolean>
  thumb: MaybeRefOrGetter<string | null | undefined>
  videoRef: Ref<HTMLVideoElement | null>
  playbackError: Ref<boolean>
  bigPreviewSize: MaybeRefOrGetter<unknown>
  bigPreviewAnimation: Ref<boolean>
  bigPreviewMenuActive: Ref<boolean>
  timeouts: HoverSessionTimeoutMap
  gridBigPreview: ReturnType<typeof useVideoBigPreview>
  hasFixedPreviewTime: MaybeRefOrGetter<boolean>
  previewStartTime: MaybeRefOrGetter<number | undefined>
  showVideoPreview: MaybeRefOrGetter<boolean>
  isBigPreviewOpen: MaybeRefOrGetter<boolean>
  isContextMenuOpen: MaybeRefOrGetter<boolean>
  getPreviewEl: () => HTMLElement | null
  clearCinemaTimeout: () => void
  resetBigPreviewOpen: () => void
  applyBigPreviewMetrics: (preview: HTMLElement) => void
  syncPreviewVideoPosition: (time: number) => void | Promise<void>
  teardownWhenPreviewHidden: () => void
  invalidateOnPlaybackError: () => void
  stopPlayingPreview: (options?: {force?: boolean}) => void
  hasActivePreviewState: () => boolean
  requestThumb: () => void
  getImg: () => void | Promise<void>
  clearPreviewResources: () => void
  clearContextMenu: () => void
}

export function useItemPreviewLifecycle(options: ItemPreviewLifecycleOptions) {
  watch(() => toValue(options.showVideoPreview), (active) => {
    if (active) return
    options.teardownWhenPreviewHidden()
  })

  watch(
    () => toValue(options.showVideoPreview) && options.videoRef.value,
    (ready) => {
      if (!ready) return
      const startTime = toValue(options.previewStartTime)
      if (toValue(options.hasFixedPreviewTime) && startTime != null) {
        void options.syncPreviewVideoPosition(startTime)
      }
    },
  )

  watch(() => toValue(options.isContextMenuOpen), (show) => {
    if (show) {
      options.clearCinemaTimeout()
      clearTimeout(options.timeouts.leave)
      if (options.bigPreviewAnimation.value || options.gridBigPreview.isExpanding.value) {
        options.resetBigPreviewOpen()
      }
      return
    }
    if (!options.bigPreviewMenuActive.value) return

    nextTick(() => {
      options.bigPreviewMenuActive.value = false
      const preview = options.getPreviewEl()
      if (preview && options.gridBigPreview.isVisual.value) {
        preview.style.zIndex = '3000'
      }
      if (!toValue(options.isHovered) && options.gridBigPreview.isVisual.value) {
        options.stopPlayingPreview()
      }
    })
  })

  watch(() => toValue(options.isFileExists), (exists) => {
    if (!exists) {
      options.clearCinemaTimeout()
      if (options.hasActivePreviewState()) {
        options.stopPlayingPreview({force: true})
      }
      return
    }
    if (isThumbUnavailable(toValue(options.thumb))) {
      void options.getImg()
    }
  })

  watch(options.playbackError, (error) => {
    if (!error) return
    options.clearCinemaTimeout()
    options.invalidateOnPlaybackError()
    if (toValue(options.isBigPreviewOpen)) {
      options.clearContextMenu()
      options.bigPreviewMenuActive.value = false
      options.stopPlayingPreview()
    }
  })

  watch(() => toValue(options.bigPreviewSize), () => {
    const preview = options.getPreviewEl()
    if (!preview || !options.gridBigPreview.isVisual.value) return
    options.applyBigPreviewMetrics(preview)
  })

  watch(() => toValue(options.isWindowFocused), (focused) => {
    // Transient blur (occlusion / DevTools) must not force-stop hover — that
    // left cards with zero reaction until leave/re-enter. Only stop when hidden.
    if (!focused && typeof document !== 'undefined' && document.hidden) {
      options.stopPlayingPreview({force: true})
    }
  }, {flush: 'sync'})

  watch(() => toValue(options.previewActive), (active) => {
    if (active) {
      options.requestThumb()
      void options.getImg()
      return
    }

    options.stopPlayingPreview({force: true})
    options.clearPreviewResources()
  }, {immediate: true})

  onMounted(async () => {
    options.isMounted.value = true
    await nextTick()
    if (toValue(options.previewActive)) {
      options.requestThumb()
      void options.getImg()
    }
  })

  onBeforeUnmount(() => {
    options.isMounted.value = false
    options.stopPlayingPreview({force: true})
    options.clearPreviewResources()

    for (const timeout in options.timeouts) {
      clearTimeout(options.timeouts[timeout as keyof HoverSessionTimeoutMap])
    }

    releaseHoverVideoPreview(toValue(options.mediaId))
    abortVideoPlayback(options.videoRef.value)
  })
}
