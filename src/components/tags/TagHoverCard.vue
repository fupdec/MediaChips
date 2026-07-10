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
            :icon="metaIcon"
            size="32"
            color="medium-emphasis"
          />
        </div>
      </div>

      <div class="item-hover-card__info">
        <div
          v-if="tag.name"
          class="item-hover-card__title"
          :title="tag.name"
        >
          {{ tag.name }}
        </div>

        <div
          v-if="tag.synonyms"
          class="item-hover-card__synonyms text-medium-emphasis"
          v-html="tag.synonyms"
        />

        <div
          v-if="showRatingRow"
          class="item-hover-card__rating-row"
        >
          <v-rating
            v-if="showRating"
            :model-value="tagRating"
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
        :item="tag"
        :tags="tag.tags"
        :values="tag.values"
        type="tag"
      />
    </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import ItemPinnedMeta from '@/components/items/ItemPinnedMeta.vue'
import { hexToRgba } from '@/services/formatUtils'
import { getCachedTagForHover, loadTagForHover } from '@/services/tagHoverCache'
import { HOVER_CARD_WIDTH } from '@/services/hoverService'
import { useAppStore } from '@/stores/app'
import {
  getTagHoverThumbCandidates,
  type TagHoverThumbCandidate,
} from '@/utils/thumbSource'
import type { Meta, Tag } from '@/types/stores'

const TAG_HOVER_IMAGE_MAX_WIDTH = 96
const TAG_HOVER_IMAGE_MAX_HEIGHT = 120

const props = defineProps<{
  metaId: number
  tagId: number
  label?: string | null
  imageAspectRatio?: number | null
}>()

const emit = defineEmits<{
  previewSize: [size: { previewWidth: number; previewHeight: number }]
}>()

const appStore = useAppStore()

const cardRef = ref<HTMLElement | null>(null)
const tag = ref<Tag>({ id: props.tagId, name: props.label ?? undefined })
const src = ref<string | null>(null)
const imageLoading = ref(false)
const candidates = ref<TagHoverThumbCandidate[]>([])
const candidateIndex = ref(0)
const activeThumbType = ref('avatar')
const imageNaturalRatio = ref<number | null>(null)
let loadToken = 0
let imageLoadToken = 0

const meta = computed((): Meta | undefined => appStore.getMetaById(props.metaId))

const metaIcon = computed(() => `mdi-${meta.value?.icon ?? 'tag'}`)

const cardColor = computed(() => {
  if (!meta.value?.color || !tag.value.color) return undefined
  return hexToRgba(tag.value.color, 9)
})

const isRatingActive = computed(() => Boolean(meta.value?.rating))
const isFavoriteActive = computed(() => Boolean(meta.value?.favorite))

const tagRating = computed(() => {
  const rating = tag.value.rating
  return typeof rating === 'number' ? rating : 0
})

const showRating = computed(() => isRatingActive.value && tagRating.value > 0)
const showFavorite = computed(() => isFavoriteActive.value && Boolean(tag.value.favorite))
const showRatingRow = computed(() => showRating.value || showFavorite.value)

const hasPinnedMeta = computed(() =>
  Boolean(tag.value.tags?.length || tag.value.values?.length),
)

const resolvedImageRatio = computed(() => {
  if (imageNaturalRatio.value && imageNaturalRatio.value > 0) {
    return imageNaturalRatio.value
  }

  if (activeThumbType.value === 'avatar') return 1

  if (props.imageAspectRatio && props.imageAspectRatio > 0) {
    return props.imageAspectRatio
  }

  return 1
})

const imageDisplaySize = computed(() => {
  const ratio = resolvedImageRatio.value
  const maxWidth = TAG_HOVER_IMAGE_MAX_WIDTH
  const maxHeight = TAG_HOVER_IMAGE_MAX_HEIGHT

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
  candidates.value = []
  candidateIndex.value = 0
  src.value = null
  imageLoading.value = false
  activeThumbType.value = 'avatar'
  imageNaturalRatio.value = null
}

function applyCandidate() {
  const candidate = candidates.value[candidateIndex.value]
  activeThumbType.value = candidate?.type ?? 'avatar'
  imageNaturalRatio.value = null
  const nextSrc = candidate?.url ?? null
  imageLoading.value = Boolean(nextSrc)
  src.value = nextSrc
  emitPreviewSize()
}

function loadImageCandidates() {
  const token = ++imageLoadToken
  const nextCandidates = getTagHoverThumbCandidates({
    dbPath: appStore.dbPath,
    metaId: props.metaId,
    tagId: props.tagId,
  })

  if (token !== imageLoadToken) return

  candidates.value = nextCandidates
  candidateIndex.value = 0
  applyCandidate()
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
  if (candidateIndex.value < candidates.value.length - 1) {
    candidateIndex.value += 1
    applyCandidate()
    return
  }

  imageLoading.value = false
  src.value = null
  emitPreviewSize()
}

async function loadTag() {
  const token = ++loadToken
  const cached = getCachedTagForHover(props.metaId, props.tagId)
  if (cached) {
    tag.value = cached
  } else if (props.label) {
    tag.value = { id: props.tagId, name: props.label }
  }

  const loaded = await loadTagForHover(props.metaId, props.tagId)
  if (token !== loadToken) return

  if (loaded) {
    tag.value = loaded
  }

  emitPreviewSize()
}

watch(
  () => [props.metaId, props.tagId] as const,
  () => {
    resetImageState()
    void loadTag()
    loadImageCandidates()
  },
  { immediate: true },
)

watch(
  () => [tag.value.tags, tag.value.values, tag.value.name, tag.value.synonyms, showRatingRow.value] as const,
  () => {
    emitPreviewSize()
  },
)
</script>
