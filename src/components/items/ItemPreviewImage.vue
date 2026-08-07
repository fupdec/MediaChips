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
        :src="thumb || undefined"
        :aspect-ratio="previewAspectRatio"
        class="thumb"
        :cover="isViewMasonry"
        :contain="!isViewMasonry"
        @load="onThumbLoad"
        @error="onThumbError"
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
const detectedWidth = ref(0)
const detectedHeight = ref(0)
const isMounted = ref(false)
let thumbObjectUrl: string | null = null
let thumbLoadStarted = false
let thumbFallbackStage = 0
let loadGeneration = 0

const ITEMS = computed(() => itemsStore)

const isViewCard = computed(() =>
  Number(ITEMS.value.view) === 1
)

const isViewTimeline = computed(() =>
  Number(ITEMS.value.view) === 2
)

const isViewMasonry = computed(() =>
  Number(ITEMS.value.view) === 3
)

const showsPreview = computed(() =>
  isViewCard.value || isViewTimeline.value || isViewMasonry.value
)

const previewAspectRatio = computed(() =>
  isViewCard.value ? 16 / 9 : getMediaAspectRatio(props.media)
)

const mediaWidth = computed(() =>
  Number(props.media?.width) || detectedWidth.value || 0
)

const mediaHeight = computed(() =>
  Number(props.media?.height) || detectedHeight.value || 0
)

const resolutionLabel = computed(() =>
  `${mediaWidth.value}x${mediaHeight.value}`
)

const showResolution = computed(() =>
  mediaWidth.value > 0 && mediaHeight.value > 0
)

const onThumbLoad = () => {
  thumbFallbackStage = 0
  if (thumb.value && isPersistentThumbUrl(thumb.value) && props.media?.id) {
    setCachedThumb(mediaThumbKey('images', props.media.id), thumb.value)
  }
  if (Number(props.media?.width) > 0 && Number(props.media?.height) > 0) return
  if (thumb.value) probeImageDimensions(thumb.value)
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

const probeImageDimensions = (src: string) => {
  if (Number(props.media?.width) > 0 && Number(props.media?.height) > 0) return
  if (!src || src.includes('unavailable.png')) return

  const img = new Image()
  img.onload = () => {
    if (!isMounted.value) return
    if (!img.naturalWidth || !img.naturalHeight) return
    detectedWidth.value = img.naturalWidth
    detectedHeight.value = img.naturalHeight
  }
  img.src = src
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
  await typedApi.updateMediaInfo(props.media.id)
}

const applyLoadedSrc = (src: string, generation: number) => {
  if (generation !== loadGeneration) {
    revokeImageObjectUrl(src?.startsWith?.('blob:') ? src : null)
    return false
  }

  if (!src.includes('unavailable.png')) {
    thumbObjectUrl = src.startsWith('blob:') ? src : null
    thumb.value = src
    probeImageDimensions(src)
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
  if (props.isFileExists) {
    try {
      await regenerateThumb()
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
  if (thumbObjectUrl) {
    clearThumbUrl()
    thumb.value = null
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
  if (!props.isFileExists) return
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
    detectedWidth.value = 0
    detectedHeight.value = 0
    if (!props.previewActive) {
      thumb.value = null
      return
    }
    requestThumb()
  },
)

watch(() => itemsStore.thumbRefreshKeys[Number(props.media?.id)], (version) => {
  if (version == null) return
  thumb.value = null
  clearThumbUrl()
  thumbLoadStarted = false
  thumbFallbackStage = 0
  void loadThumb({cacheBust: true})
})
</script>
