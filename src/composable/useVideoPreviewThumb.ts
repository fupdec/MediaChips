import {computed, ref, watch, type MaybeRefOrGetter, toValue} from 'vue'
import path from 'path-browserify'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {typedApi} from '@/services/typedApi'
import {buildLocalFileUrl} from '@/services/fileService'
import {
  getCachedThumb,
  invalidateVideoThumbCaches,
  mediaThumbKey,
  setCachedThumb,
} from '@/utils/thumbDisplayCache'
import {isThumbUnavailable, resolveMediaThumbDisplayUrl, CARD_THUMB_MAX_EDGE} from '@/utils/thumbSource'
import {probeDisplayImageUrl} from '@/utils/probeImageUrl'
import type {MediaItem} from '@/types/stores'

const thumbLoadInFlight = new Map<string, Promise<void>>()

export type VideoPreviewThumbOptions = {
  media: MaybeRefOrGetter<MediaItem>
  previewActive: MaybeRefOrGetter<boolean>
  isFileExists: MaybeRefOrGetter<boolean>
  thumbUrl: MaybeRefOrGetter<string | undefined>
  isViewCard: MaybeRefOrGetter<boolean>
  isEmbeddedHost: MaybeRefOrGetter<boolean>
  isMounted: MaybeRefOrGetter<boolean>
  mediaPath: MaybeRefOrGetter<string>
  /** Called after a store-driven thumb refresh finishes loading. */
  onThumbRefreshed?: (options: {shouldRegenerate: boolean}) => void
}

export function useVideoPreviewThumb(options: VideoPreviewThumbOptions) {
  const itemsStore = useItemsStore()
  const settingsStore = useSettingsStore()

  const thumb = ref<string | null>(null)
  const isCreatingThumb = ref(false)
  const thumbCreateAttempted = ref(false)
  const thumbLoadStarted = ref(false)
  const thumbFallbackStage = ref(0)

  /** In-flight probes — abort only on clear/pause, never when starting another probe. */
  const thumbProbeControllers = new Set<AbortController>()

  const media = computed(() => toValue(options.media))
  const usesExternalThumb = computed(() => {
    const url = toValue(options.thumbUrl)
    return url != null && url !== ''
  })
  const thumbDisplayKey = computed(() =>
    itemsStore.thumbRefreshKeys[Number(media.value.id)] ?? 0,
  )

  const abortThumbProbe = () => {
    for (const controller of thumbProbeControllers) {
      controller.abort()
    }
    thumbProbeControllers.clear()
  }

  /**
   * Concurrent thumb + grid probes must not cancel each other: abort resolves as
   * false and timeline code treated that as "grid missing", clearing sprites and
   * re-triggering createGrid.
   */
  const runImageProbe = async (url: string) => {
    const controller = new AbortController()
    thumbProbeControllers.add(controller)
    try {
      return await probeDisplayImageUrl(url, controller.signal)
    } finally {
      thumbProbeControllers.delete(controller)
    }
  }

  const clearThumbState = () => {
    abortThumbProbe()
    thumb.value = null
    thumbLoadStarted.value = false
    thumbCreateAttempted.value = false
    thumbFallbackStage.value = 0
  }

  /**
   * Leave the viewport: stop probes/work, but keep the last HTTP thumb src.
   * Nulling `:src` while VImg still has a pending load races Vuetify's
   * pollForSize (naturalHeight of null) — see vuetify#23011.
   */
  const pauseOffscreenThumb = () => {
    abortThumbProbe()
    thumbLoadStarted.value = false
    thumbCreateAttempted.value = false
    thumbFallbackStage.value = 0
  }

  const resolveThumbFallback = (): string => {
    const item = media.value
    if (!item?.id) return ''

    if (thumb.value && !isThumbUnavailable(thumb.value)) {
      return thumb.value
    }

    const cached = getCachedThumb(mediaThumbKey('videos', item.id, 'thumbs'))
    if (cached && !isThumbUnavailable(cached)) {
      return cached
    }

    const url = resolveMediaThumbDisplayUrl(
      toValue(options.mediaPath),
      'videos',
      item.id,
      'thumbs',
      {maxEdge: CARD_THUMB_MAX_EDGE},
    )
    return url && !isThumbUnavailable(url) ? url : ''
  }

  /** Grid only on library cards — never in edit dialog (embedded) or when forced thumbs. */
  const getStaticPreviewSubfolder = (): 'thumbs' | 'grids' =>
    settingsStore.videoPreviewStatic === 'grid'
    && toValue(options.isViewCard)
    && !toValue(options.isEmbeddedHost)
      ? 'grids'
      : 'thumbs'

  const onThumbLoad = () => {
    thumbFallbackStage.value = 0
    const item = media.value
    if (thumb.value && !isThumbUnavailable(thumb.value) && item?.id) {
      setCachedThumb(
        mediaThumbKey('videos', item.id, getStaticPreviewSubfolder()),
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

  const loadThumb = (
    subfolder: 'thumbs' | 'grids',
    {bust = false as boolean | number} = {},
  ) => {
    const item = media.value
    if (!item?.id) return

    if (bust) {
      invalidateVideoThumbCaches(item.id)
    }

    const mediaPath = toValue(options.mediaPath)
    // Card thumbs: downscaled decode. Grid sprites: full size for timeline frames.
    const maxEdge = subfolder === 'grids' ? undefined : CARD_THUMB_MAX_EDGE
    const thumbUrl = bust
      ? buildLocalFileUrl(path.join(
        mediaPath,
        'videos',
        subfolder,
        `${item.id}.jpg`,
      ), false, bust, maxEdge != null ? {maxEdge} : undefined)
      : resolveMediaThumbDisplayUrl(
        mediaPath,
        'videos',
        item.id,
        subfolder,
        maxEdge != null ? {maxEdge} : undefined,
      )

    thumb.value = thumbUrl

    if (thumbUrl && !isThumbUnavailable(thumbUrl)) {
      setCachedThumb(mediaThumbKey('videos', item.id, subfolder), thumb.value)
    }
  }

  const createThumb = async () => {
    const item = media.value
    try {
      await typedApi.taskCreateThumbForVideo({
        path: item.path,
        id: item.id,
      })
    } catch (e) {
      // Missing source files after migration are common; avoid spamming the console.
      if (import.meta.env.DEV) {
        console.debug('createThumb failed', item?.id, e)
      }
    }
  }

  const maybeCreateMissingThumb = async () => {
    if (!toValue(options.previewActive) || !toValue(options.isFileExists) || !thumb.value) return
    if (isCreatingThumb.value || thumbCreateAttempted.value) return

    const exists = await runImageProbe(thumb.value)
    if (!toValue(options.isMounted)) return
    if (exists) return

    isCreatingThumb.value = true
    thumbCreateAttempted.value = true
    try {
      await createThumb()
      loadThumb('thumbs', {bust: true})
    } finally {
      isCreatingThumb.value = false
    }
  }

  const loadImg = async ({bust = false as boolean | number, allowCreate = true} = {}) => {
    if (!toValue(options.previewActive) || !toValue(options.isMounted) || !media.value?.id) return

    if (usesExternalThumb.value) {
      thumb.value = toValue(options.thumbUrl) ?? null
      return
    }

    const subfolder = getStaticPreviewSubfolder()

    if (!bust) {
      const cached = getCachedThumb(mediaThumbKey('videos', media.value.id, subfolder))
      if (cached && !isThumbUnavailable(cached)) {
        const hasMaxEdge = String(cached).includes('maxEdge=')
        // Grids must be full-size sprites; card thumbs want maxEdge.
        if (subfolder === 'grids' ? !hasMaxEdge : hasMaxEdge) {
          thumb.value = cached
          return
        }
      }
    }

    if (subfolder === 'grids') {
      loadThumb('grids', {bust})
      if (allowCreate && thumb.value) {
        const gridExists = await runImageProbe(thumb.value)
        if (!toValue(options.isMounted)) return
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

  const getImg = async ({bust = false as boolean | number, allowCreate = true} = {}) => {
    if (!toValue(options.previewActive) || !media.value?.id) return
    // Wait for mount — do not latch thumbLoadStarted on a no-op.
    if (!toValue(options.isMounted)) return

    const subfolder = getStaticPreviewSubfolder()
    const bustKey = bust === false ? 0 : bust === true ? 1 : bust
    const key = `${media.value.id}:${subfolder}:${bustKey}:${allowCreate ? 1 : 0}`
    const existing = thumbLoadInFlight.get(key)
    if (existing) {
      await existing
      return
    }

    thumbLoadStarted.value = true
    const promise = loadImg({bust, allowCreate})
    thumbLoadInFlight.set(key, promise)
    try {
      await promise
    } finally {
      thumbLoadInFlight.delete(key)
    }
  }

  const requestThumb = () => {
    if (!toValue(options.previewActive)) return
    if (thumbLoadStarted.value && thumb.value && !isThumbUnavailable(thumb.value)) return
    void getImg()
  }

  watch(() => toValue(options.thumbUrl), (url) => {
    if (!usesExternalThumb.value) return
    thumb.value = url ?? null
  }, {immediate: true})

  watch(() => settingsStore.videoPreviewStatic, () => {
    thumbFallbackStage.value = 0
    thumbCreateAttempted.value = false
    void getImg({bust: true})
  })

  watch(() => itemsStore.thumbRefreshKeys[Number(media.value.id)], (version) => {
    if (version == null) return
    invalidateVideoThumbCaches(media.value.id)
    const shouldRegenerate = itemsStore.consumeThumbRegenerate(media.value.id)
    if (shouldRegenerate) {
      thumbCreateAttempted.value = false
      thumbFallbackStage.value = 0
    }
    // Stable bust token (not Date.now()) so Chromium reuses one cache entry per refresh.
    void getImg({bust: version, allowCreate: shouldRegenerate}).then(() => {
      options.onThumbRefreshed?.({shouldRegenerate})
    })
  })

  return {
    thumb,
    thumbDisplayKey,
    usesExternalThumb,
    isCreatingThumb,
    thumbCreateAttempted,
    thumbLoadStarted,
    thumbFallbackStage,
    abortThumbProbe,
    runImageProbe,
    clearThumbState,
    pauseOffscreenThumb,
    resolveThumbFallback,
    getStaticPreviewSubfolder,
    onThumbLoad,
    onThumbError,
    loadThumb,
    getImg,
    requestThumb,
  }
}
