<template>
  <div
    class="image-preview-wrap"
    :class="{ 'no-file': !isFileExists }"
  >
    <v-responsive
      v-if="showsPreview"
      v-ripple="{ class: 'text-primary' }"
      :aspect-ratio="previewAspectRatio"
      class="image-preview-container"
      @click.stop="openViewer"
    >
      <v-img
        v-if="previewActive && thumb"
        :src="thumb || undefined"
        :aspect-ratio="previewAspectRatio"
        class="thumb"
        :cover="isViewMasonry || isViewSquares || isListView"
        :contain="!isViewMasonry && !isViewSquares && !isListView"
        @load="onThumbLoad"
        @error="onThumbError"
      />
      <div
        v-else
        class="thumb thumb--placeholder"
        :style="previewAspectRatio ? { aspectRatio: String(previewAspectRatio) } : undefined"
        aria-hidden="true"
      />
    </v-responsive>

    <div
      v-if="showResolution"
      class="image-resolution"
    >
      {{ resolutionLabel }}
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, onBeforeUnmount} from 'vue'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import { loadImageDisplayUrl, revokeImageObjectUrl, IMAGE_UNAVAILABLE_URL } from '@/utils/imageSource'
import {getMediaAspectRatio} from '@/utils/gridLayout'
import {
  getCachedThumb,
  invalidateCachedThumb,
  isPersistentThumbUrl,
  mediaThumbKey,
  setCachedThumb,
} from '@/utils/thumbDisplayCache'
import {enqueueImageThumbAndMeta, isEmptyMediaSource} from '@/utils/quietMediaBackfill'
import {probeDisplayImageUrl} from '@/utils/probeImageUrl'
import {galleryPerfCounters} from '@/utils/galleryPerfCounters'
import type {MediaItem} from '@/types/stores'

const props = withDefaults(defineProps<{
  media: MediaItem
  isFileExists?: boolean
  previewActive?: boolean
}>(), {
  isFileExists: true,
  previewActive: true,
})

const store = useAppStore()
const itemsStore = useItemsStore()

const thumb = ref<string | null>(null)
const isMounted = ref(false)
let thumbObjectUrl: string | null = null
let thumbLoadStarted = false
let thumbFallbackStage = 0
let thumbRegenAttempted = false
/** True after the current `thumb` src fired @load — ignore late @error from a prior src. */
let thumbPainted = false
let loadGeneration = 0

const ITEMS = computed(() => itemsStore)

const isViewCard = computed(() =>
  Number(ITEMS.value.view) === 1 || Number(ITEMS.value.view) === 5
)

const isViewTimeline = computed(() =>
  Number(ITEMS.value.view) === 2
)

const isViewMasonry = computed(() =>
  Number(ITEMS.value.view) === 3
)

const isViewSquares = computed(() =>
  Number(ITEMS.value.view) === 6
)

const isListView = computed(() =>
  Number(ITEMS.value.view) === 5
)

const showsPreview = computed(() =>
  isViewCard.value || isViewTimeline.value || isViewMasonry.value || isViewSquares.value
)

const previewAspectRatio = computed(() => {
  const view = Number(ITEMS.value.view)
  if (view === 1) return 16 / 9
  if (view === 5 || isViewSquares.value) return 1
  return getMediaAspectRatio(props.media)
})

const mediaWidth = computed(() =>
  Number(props.media?.width) || 0
)

const mediaHeight = computed(() =>
  Number(props.media?.height) || 0
)

const resolutionLabel = computed(() =>
  `${mediaWidth.value}x${mediaHeight.value}`
)

const showResolution = computed(() =>
  mediaWidth.value > 0 && mediaHeight.value > 0
  && !isViewCard.value
  && !isViewMasonry.value
  && !isViewSquares.value
)

const onThumbLoad = () => {
  thumbFallbackStage = 0
  thumbPainted = true
  if (thumb.value && isPersistentThumbUrl(thumb.value) && props.media?.id) {
    setCachedThumb(mediaThumbKey('images', props.media.id), thumb.value)
  }
  // Do not probe thumb pixels for resolution — thumbs are height-capped and
  // would show the wrong WxH. Aspect for layout comes from media.width/height.
}

const regenerateThumb = async () => {
  if (!props.previewActive) return
  if (isEmptyMediaSource(props.media)) return
  // Quiet: create thumb + sync width/height into the store (no task toast).
  await enqueueImageThumbAndMeta(Number(props.media.id))
  // refreshThumb inside backfill clears this flag — keep it latched so a
  // mid-reload probe miss cannot start another regen storm.
  thumbRegenAttempted = true
}

const reloadThumbAfterRegen = async (generation: number) => {
  if (!props.media?.id) return
  invalidateCachedThumb(mediaThumbKey('images', props.media.id))
  if (!props.previewActive || generation !== loadGeneration) return
  thumbLoadStarted = false
  thumbFallbackStage = 0
  await loadThumb({cacheBust: true})
}

/**
 * Lite-imported images have DB rows but no thumb file yet. Mirror videos:
 * probe the constructed URL and create the thumb, then bust-reload so the card paints.
 */
const maybeCreateMissingThumb = async (src: string, generation: number) => {
  if (!props.isFileExists || !props.previewActive || thumbRegenAttempted) return
  if (isEmptyMediaSource(props.media)) return
  if (!src || src.includes('unavailable.png')) return

  const exists = await probeDisplayImageUrl(src)
  if (!isMounted.value || generation !== loadGeneration || !props.previewActive) return
  if (exists) return

  thumbRegenAttempted = true
  try {
    await regenerateThumb()
    await reloadThumbAfterRegen(generation)
  } catch (error) {
    console.error('Image thumbnail regeneration failed:', error)
  }
}

const onThumbError = () => {
  void handleThumbError()
}

const handleThumbError = async () => {
  // VImg can emit @error for a superseded src after regen already painted the new thumb.
  if (thumbPainted) return

  if (!props.previewActive || !props.media?.id) {
    thumb.value = IMAGE_UNAVAILABLE_URL
    return
  }

  const generation = loadGeneration

  // Missing thumb on disk (common after fast/lite import): generate, then show it.
  if (!thumbRegenAttempted && props.isFileExists && !isEmptyMediaSource(props.media)) {
    thumbRegenAttempted = true
    try {
      await regenerateThumb()
      await reloadThumbAfterRegen(generation)
      return
    } catch (error) {
      console.error('Image thumbnail regeneration failed:', error)
    }
  }

  if (thumbFallbackStage >= 1) {
    thumb.value = IMAGE_UNAVAILABLE_URL
    return
  }

  thumbFallbackStage += 1
  thumbLoadStarted = false
  void loadThumb({cacheBust: true})
}

const clearThumbUrl = () => {
  revokeImageObjectUrl(thumbObjectUrl)
  thumbObjectUrl = null
}

const applyCachedThumb = (): boolean => {
  if (!props.media?.id) return false

  const cached = getCachedThumb(mediaThumbKey('images', props.media.id))
  if (!isPersistentThumbUrl(cached)) return false

  thumbObjectUrl = null
  thumb.value = cached!
  return true
}

const applyLoadedSrc = (src: string, generation: number) => {
  if (generation !== loadGeneration) {
    revokeImageObjectUrl(src?.startsWith?.('blob:') ? src : null)
    return false
  }

  if (!src.includes('unavailable.png')) {
    thumbObjectUrl = src.startsWith('blob:') ? src : null
    thumb.value = src
    return true
  }

  return false
}

const loadThumb = async ({cacheBust = false, preferFull = false} = {}) => {
  if (!props.media?.id) return
  if (!store.mediaPath && !preferFull) return
  if (thumbLoadStarted && !cacheBust) return
  thumbLoadStarted = true
  const generation = ++loadGeneration
  thumbPainted = false
  clearThumbUrl()
  galleryPerfCounters.thumbInFlight += 1

  try {
    const src = await loadImageDisplayUrl(props.media, store.mediaPath, {cacheBust, preferFull})

    if (!isMounted.value) {
      // Keep the result if we are still the latest load; apply once mounted.
      if (generation !== loadGeneration) {
        revokeImageObjectUrl(src?.startsWith?.('blob:') ? src : null)
        return
      }
      if (!src.includes('unavailable.png')) {
        thumbObjectUrl = src.startsWith('blob:') ? src : null
        thumb.value = src
      }
      return
    }

    if (applyLoadedSrc(src, generation)) {
      void maybeCreateMissingThumb(src, generation)
      return
    }

    // Generated thumbs live under mediaPath even when the source file is missing.
    // Skip regen when the card left the viewport (generation bump / preview off).
    if (
      props.isFileExists
      && props.previewActive
      && generation === loadGeneration
      && !thumbRegenAttempted
      && !isEmptyMediaSource(props.media)
    ) {
      try {
        thumbRegenAttempted = true
        await regenerateThumb()
        await reloadThumbAfterRegen(generation)
        if (thumb.value && !thumb.value.includes('unavailable.png')) return
      } catch (error) {
        console.error('Image thumbnail regeneration failed:', error)
      }
    }

    if (generation !== loadGeneration) return
    thumbObjectUrl = null
    thumb.value = IMAGE_UNAVAILABLE_URL
  } finally {
    galleryPerfCounters.thumbInFlight = Math.max(0, galleryPerfCounters.thumbInFlight - 1)
  }
}

const requestThumb = () => {
  if (!props.previewActive) return
  // Keep warm HTTP thumbs across scroll; only (re)load when empty or blob-cleared.
  if (thumb.value && !thumb.value.includes('unavailable.png') && !thumbObjectUrl) return
  if (applyCachedThumb()) {
    // Cached URL may be stale after lite import — verify and regen if needed.
    void maybeCreateMissingThumb(thumb.value!, loadGeneration)
    return
  }
  thumbLoadStarted = false
  thumbFallbackStage = 0
  void loadThumb()
}

/** Cancel in-flight loads when leaving the viewport, but keep HTTP thumbs warm. */
const pauseOffscreenThumb = () => {
  loadGeneration += 1
  // Revoke blob URLs without nulling `:src` in the same tick — that races
  // Vuetify VImg pollForSize when a pending load fires (naturalHeight of null).
  if (thumbObjectUrl) {
    const blobUrl = thumbObjectUrl
    thumbObjectUrl = null
    queueMicrotask(() => {
      revokeImageObjectUrl(blobUrl)
      if (!props.previewActive && thumb.value === blobUrl) {
        thumb.value = IMAGE_UNAVAILABLE_URL
      }
    })
  }
  thumbLoadStarted = false
  thumbFallbackStage = 0
}

watch(() => props.previewActive, (active) => {
  if (active) {
    requestThumb()
    return
  }
  pauseOffscreenThumb()
}, { immediate: true })

/** Thumb click always opens the viewer; browser-layout inspect stays on the card description. */
const openViewer = () => {
  // Allow opening even if the source path is missing — thumbs/full may still load,
  // and the viewer shows an error state when nothing is readable.
  itemsStore.viewImage({
    image: props.media,
    previewSrc: thumb.value || null,
  })
}

onMounted(() => {
  isMounted.value = true
  if (props.previewActive) requestThumb()
})

onBeforeUnmount(() => {
  isMounted.value = false
  loadGeneration += 1
  clearThumbUrl()
})

watch(
  () => [props.media?.id, props.isFileExists, store.mediaPath] as const,
  (next, prev) => {
    if (prev && next[0] !== prev[0]) {
      thumbRegenAttempted = false
    }
    // Source-file existence only affects the no-file styling / open gate.
    // Thumbs still load from mediaPath/images/thumbs independently.
    if (!props.previewActive) {
      // Keep a stable src for mounted VImg; next active pass will reload.
      return
    }
    requestThumb()
  },
)

watch(() => itemsStore.thumbRefreshKeys[Number(props.media?.id)], (version) => {
  if (version == null) return
  // Swap src only when actively shown; otherwise wait for the next requestThumb.
  clearThumbUrl()
  thumbLoadStarted = false
  thumbFallbackStage = 0
  thumbRegenAttempted = false
  thumbPainted = false
  if (!props.previewActive) return
  void loadThumb({cacheBust: true})
})
</script>
