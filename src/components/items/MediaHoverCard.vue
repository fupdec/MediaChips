<template>
  <v-card
    class="item-hover-card"
    :color="cardColor"
    variant="flat"
  >
    <div ref="cardRef" class="item-hover-card__content">
      <div class="item-hover-card__header">
        <div
          class="item-hover-card__media"
          :style="mediaStyle"
        >
          <img
            v-if="src"
            :key="src"
            :src="src"
            alt=""
            class="item-hover-card__image"
            @load="onImageLoad"
            @error="onImageError"
          />
          <div
            v-else-if="imageLoading"
            class="item-hover-card__placeholder"
          >
            <v-progress-circular
              indeterminate
              size="24"
              width="2"
              color="primary"
            />
          </div>
          <div
            v-else
            class="item-hover-card__placeholder"
          >
            <v-icon
              :icon="mediaIcon"
              size="32"
              color="medium-emphasis"
            />
          </div>
        </div>

        <div class="item-hover-card__info">
          <div
            v-if="media.name"
            class="item-hover-card__title"
            :title="media.name"
          >
            {{ media.name }}
          </div>

          <div
            v-if="media.synonyms"
            class="item-hover-card__synonyms text-medium-emphasis"
            v-html="media.synonyms"
          />

          <div
            v-if="showRatingRow"
            class="item-hover-card__rating-row"
          >
            <v-rating
              v-if="showRating"
              :model-value="mediaRating"
              active-color="yellow-darken-2"
              color="#eee"
              class="item-hover-card__rating"
              empty-icon="mdi-star-outline"
              half-icon="mdi-star-half-full"
              density="compact"
              half-increments
              readonly
            />
            <v-icon
              v-if="showFavorite"
              icon="mdi-heart"
              color="pink"
              size="20"
            />
          </div>
        </div>
      </div>

      <div
        v-if="hasPinnedMeta"
        class="item-hover-card__meta"
      >
        <ItemPinnedMeta
          :item="media"
          :tags="media.tags"
          :values="media.values"
          type="media"
        />
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import ItemPinnedMeta from '@/components/items/ItemPinnedMeta.vue'
import { hexToRgba } from '@/services/formatUtils'
import { HOVER_CARD_WIDTH } from '@/services/hoverService'
import {
  getCachedMediaForHover,
  loadMediaForHover,
} from '@/services/mediaHoverCache'
import { useAppStore } from '@/stores/app'
import {
  findMediaTypeById,
  getMediaDeleteAssetFolder,
} from '@/utils/mediaType'
import {
  isThumbUnavailable,
  resolveMediaThumbDisplayUrl,
} from '@/utils/thumbSource'
import type { MediaItem } from '@/types/stores'

const HOVER_IMAGE_MAX_WIDTH = 96
const HOVER_IMAGE_MAX_HEIGHT = 120

const props = defineProps<{
  mediaTypeId: number
  mediaId: number
  label?: string | null
  width?: number | null
  height?: number | null
  isVideo?: boolean
}>()

const emit = defineEmits<{
  previewSize: [size: { previewWidth: number; previewHeight: number }]
}>()

const appStore = useAppStore()

const cardRef = ref<HTMLElement | null>(null)
const media = ref<MediaItem>({ id: props.mediaId, name: props.label ?? undefined })
const src = ref<string | null>(null)
const imageLoading = ref(false)
const imageNaturalRatio = ref<number | null>(null)
let loadToken = 0
let imageLoadToken = 0

const mediaType = computed(() => findMediaTypeById(appStore.mediaTypes, props.mediaTypeId))

const mediaTypeFolder = computed(() => getMediaDeleteAssetFolder(mediaType.value) || 'videos')

const mediaIcon = computed(() => `mdi-${mediaType.value?.icon ?? 'file'}`)

const cardColor = computed(() => {
  if (!media.value.color) return undefined
  return hexToRgba(media.value.color, 9)
})

const mediaRating = computed(() => {
  const rating = media.value.rating
  return typeof rating === 'number' ? rating : 0
})

const showRating = computed(() => mediaRating.value > 0)
const showFavorite = computed(() => Boolean(media.value.favorite))
const showRatingRow = computed(() => showRating.value || showFavorite.value)

const hasPinnedMeta = computed(() =>
  Boolean(media.value.tags?.length || media.value.values?.length),
)

const resolvedImageRatio = computed(() => {
  if (imageNaturalRatio.value && imageNaturalRatio.value > 0) {
    return imageNaturalRatio.value
  }

  const width = Number(props.width || media.value.width || 0)
  const height = Number(props.height || media.value.height || 0)
  if (width > 0 && height > 0) {
    return width / height
  }

  return props.isVideo ? 16 / 9 : 1
})

const imageDisplaySize = computed(() => {
  const ratio = resolvedImageRatio.value
  const maxWidth = HOVER_IMAGE_MAX_WIDTH
  const maxHeight = HOVER_IMAGE_MAX_HEIGHT

  if (ratio >= 1) {
    const width = Math.min(maxWidth, maxHeight * ratio)
    return {
      width: Math.round(width),
      height: Math.round(width / ratio),
    }
  }

  const height = maxHeight
  return {
    width: Math.round(height * ratio),
    height,
  }
})

const mediaStyle = computed(() => ({
  width: `${imageDisplaySize.value.width}px`,
  minHeight: `${imageDisplaySize.value.height}px`,
}))

function emitPreviewSize() {
  void nextTick(() => {
    const height = cardRef.value?.offsetHeight ?? imageDisplaySize.value.height
    emit('previewSize', {
      previewWidth: HOVER_CARD_WIDTH,
      previewHeight: height,
    })
  })
}

function resetImageState() {
  imageLoadToken += 1
  src.value = null
  imageLoading.value = false
  imageNaturalRatio.value = null
}

function loadImage() {
  const token = ++imageLoadToken
  const url = resolveMediaThumbDisplayUrl(
    appStore.mediaPath,
    mediaTypeFolder.value,
    props.mediaId,
  )

  if (token !== imageLoadToken) return

  if (url && !isThumbUnavailable(url)) {
    imageLoading.value = true
    src.value = url
  } else {
    imageLoading.value = false
    src.value = null
  }

  emitPreviewSize()
}

function onImageLoad(event: Event) {
  const image = event.target as HTMLImageElement
  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
    imageNaturalRatio.value = image.naturalWidth / image.naturalHeight
  }

  imageLoading.value = false
  emitPreviewSize()
}

function onImageError() {
  imageLoading.value = false
  src.value = null
  emitPreviewSize()
}

async function loadMedia() {
  const token = ++loadToken
  const cached = getCachedMediaForHover(props.mediaTypeId, props.mediaId)
  if (cached) {
    media.value = cached
  } else if (props.label) {
    media.value = {
      id: props.mediaId,
      name: props.label,
      width: props.width ?? undefined,
      height: props.height ?? undefined,
    }
  }

  const loaded = await loadMediaForHover(props.mediaTypeId, props.mediaId)
  if (token !== loadToken) return

  if (loaded) {
    media.value = loaded
  }

  emitPreviewSize()
}

watch(
  () => [props.mediaTypeId, props.mediaId, mediaTypeFolder.value] as const,
  () => {
    resetImageState()
    void loadMedia()
    loadImage()
  },
  { immediate: true },
)

watch(
  () => [
    media.value.tags,
    media.value.values,
    media.value.name,
    media.value.synonyms,
    showRatingRow.value,
  ] as const,
  () => {
    emitPreviewSize()
  },
)
</script>
