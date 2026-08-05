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
import {isThumbUnavailable, resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
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

  let thumbProbeController: AbortController | null = null

  const media = computed(() => toValue(options.media))
  const usesExternalThumb = computed(() => {
    const url = toValue(options.thumbUrl)
    return url != null && url !== ''
  })
  const thumbDisplayKey = computed(() =>
    itemsStore.thumbRefreshKeys[Number(media.value.id)] ?? 0,
  )

  const abortThumbProbe = () => {
    thumbProbeController?.abort()
    thumbProbeController = null
  }

  const runImageProbe = async (url: string) => {
    abortThumbProbe()
    thumbProbeController = new AbortController()
    return probeDisplayImageUrl(url, thumbProbeController.signal)
  }

  const clearThumbState = () => {
    abortThumbProbe()
    thumb.value = null
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

    const url = resolveMediaThumbDisplayUrl(toValue(options.mediaPath), 'videos', item.id)
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

  const loadThumb = (subfolder: 'thumbs' | 'grids', {bust = false} = {}) => {
    const item = media.value
    if (!item?.id) return

    if (bust) {
      invalidateVideoThumbCaches(item.id)
    }

    const mediaPath = toValue(options.mediaPath)
    const thumbUrl = bust
      ? buildLocalFileUrl(path.join(
        mediaPath,
        'videos',
        subfolder,
        `${item.id}.jpg`,
      ), false, true)
      : resolveMediaThumbDisplayUrl(mediaPath, 'videos', item.id, subfolder)

    thumb.value = thumbUrl

    if (thumbUrl && !isThumbUnavailable(thumbUrl)) {
      setCachedThumb(mediaThumbKey('videos', item.id, subfolder), thumbUrl)
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

  const loadImg = async ({bust = false, allowCreate = true} = {}) => {
    if (!toValue(options.previewActive) || !toValue(options.isMounted) || !media.value?.id) return

    if (usesExternalThumb.value) {
      thumb.value = toValue(options.thumbUrl) ?? null
      return
    }

    const subfolder = getStaticPreviewSubfolder()

    if (!bust) {
      const cached = getCachedThumb(mediaThumbKey('videos', media.value.id, subfolder))
      if (cached && !isThumbUnavailable(cached)) {
        thumb.value = cached
        return
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

  const getImg = async ({bust = false, allowCreate = true} = {}) => {
    if (!toValue(options.previewActive) || !toValue(options.isMounted) || !media.value?.id) return

    const subfolder = getStaticPreviewSubfolder()
    const key = `${media.value.id}:${subfolder}:${bust ? 1 : 0}:${allowCreate ? 1 : 0}`
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

  const requestThumb = () => {
    if (!toValue(options.previewActive)) return
    if (thumbLoadStarted.value) return
    thumbLoadStarted.value = true
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
    void getImg({bust: true, allowCreate: shouldRegenerate}).then(() => {
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
    resolveThumbFallback,
    getStaticPreviewSubfolder,
    onThumbLoad,
    onThumbError,
    loadThumb,
    getImg,
    requestThumb,
  }
}
