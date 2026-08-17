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
        :cover="isViewMasonry || isListView"
        :contain="!isViewMasonry && !isListView"
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
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import { loadImageDisplayUrl, revokeImageObjectUrl, IMAGE_UNAVAILABLE_URL } from '@/utils/imageSource'
import {getMediaAspectRatio} from '@/utils/gridLayout'
import {getCachedThumb, isPersistentThumbUrl, mediaThumbKey, setCachedThumb} from '@/utils/thumbDisplayCache'
import {enqueueImageThumbRegen} from '@/utils/imageThumbRegen'
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

const isListView = computed(() =>
  Number(ITEMS.value.view) === 5
)

const showsPreview = computed(() =>
  isViewCard.value || isViewTimeline.value || isViewMasonry.value
)

const previewAspectRatio = computed(() => {
  const view = Number(ITEMS.value.view)
  if (view === 1) return 16 / 9
  if (view === 5) return 1
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
  && !isViewCard
  && !isViewMasonry
)

const onThumbLoad = () => {
  thumbFallbackStage = 0
  if (thumb.value && isPersistentThumbUrl(thumb.value) && props.media?.id) {
    setCachedThumb(mediaThumbKey('images', props.media.id), thumb.value)
  }
  // Do not probe thumb pixels for resolution — thumbs are height-capped and
  // would show the wrong WxH. Aspect for layout comes from media.width/height.
}

const onThumbError = () => {
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

const regenerateThumb = async () => {
  if (!props.previewActive) return
  await enqueueImageThumbRegen(Number(props.media.id), () =>
    typedApi.updateMediaInfo(props.media.id).then(() => undefined),
  )
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

    if (applyLoadedSrc(src, generation)) return

    // Generated thumbs live under mediaPath even when the source file is missing.
    // Skip regen when the card left the viewport (generation bump / preview off).
    if (props.isFileExists && props.previewActive && generation === loadGeneration) {
      try {
        await regenerateThumb()
        if (!props.previewActive || generation !== loadGeneration) return
        const regenerated = await loadImageDisplayUrl(props.media, store.mediaPath, {cacheBust: true})
        if (applyLoadedSrc(regenerated, generation)) return
        revokeImageObjectUrl(regenerated?.startsWith?.('blob:') ? regenerated : null)
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
  if (applyCachedThumb()) return
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
  () => {
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
  if (!props.previewActive) return
  void loadThumb({cacheBust: true})
})
</script>
