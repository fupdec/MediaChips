<template>
  <!-- GRID VIEW -->
  <div v-if="Number(ITEMS.view) === 1">
      <v-img
        :src="images.main || undefined"
        :aspect-ratio="meta?.imageAspectRatio"
        class="main-img"
        :class="{ static: images.alt }"
        cover
        @click="openTagPage"
      />

      <v-img
        v-if="images.alt"
        :src="images.alt"
        :aspect-ratio="meta?.imageAspectRatio"
        class="secondary-img"
        cover
        @click="openTagPage"
      />

      <div v-if="images.custom1" class="custom1-img-button">1</div>
      <v-img
        v-if="images.custom1"
        :src="images.custom1"
        class="custom1-img"
        cover
      />

      <div v-if="images.custom2" class="custom2-img-button">2</div>
      <v-img
        v-if="images.custom2"
        :src="images.custom2"
        class="custom2-img"
        cover
      />

      <div v-if="meta?.country" class="country">
        <div
          v-for="i in countries"
          :key="i"
          class="flag-icon mb-1"
        >
          <country-flag
            :country="getFlag(i)"
            size="normal"
            :title="i"
          />
        </div>
      </div>
  </div>

  <!-- CHIP VIEW -->
  <span
    v-else-if="Number(ITEMS.view) === 2"
    class="tag-chip-avatar-wrap"
  >
    <v-avatar
      class="tag-chip-avatar"
      :rounded="meta?.chipLabel ? 0 : 'circle'"
      @click="openTagPage"
    >
      <v-img
        :src="avatar || undefined"
        cover
        @error="onChipImageError"
      />
    </v-avatar>
  </span>
</template>

<script setup lang="ts">
import { reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import CountryFlag from '@/components/ui/CountryFlagLazy.vue'
import { parseCountries, getCountryCode } from '@/utils/country'

import { useAppStore } from '@/stores/app'
import { useItemsStore } from '@/stores/items'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {hideHoverImage} from '@/services/hoverService'
import {
  getCachedThumb,
  setCachedThumb,
  tagThumbKey,
} from '@/utils/thumbDisplayCache'
import {isThumbUnavailable, resolveTagThumbDisplayUrl} from '@/utils/thumbSource'
import type {Meta, Tag} from '@/types/stores'

type TagImageType = 'main' | 'alt' | 'custom1' | 'custom2' | 'avatar'

const props = withDefaults(defineProps<{
  tag: Tag
  meta: Meta
  upd?: number[]
}>(), {
  upd: () => [],
})

const appStore = useAppStore()
const itemsStore = useItemsStore()
const router = useRouter()

const images = reactive<Record<TagImageType, string | null>>({
  main: null,
  alt: null,
  custom1: null,
  custom2: null,
  avatar: null,
})

const ITEMS = computed(() => itemsStore)

const countries = computed(() =>
  parseCountries(typeof props.tag.country === 'string' ? props.tag.country : undefined)
)

const failedImageTypes = reactive(new Set<TagImageType>())

const avatar = computed(() => {
  if (images.avatar && !failedImageTypes.has('avatar')) return images.avatar
  if (images.main && !failedImageTypes.has('main')) return images.main
  return null
})

function getImageTypes(): TagImageType[] {
  if (Number(ITEMS.value.view) === 2) {
    return ['avatar', 'main']
  }
  return ['main', 'alt', 'custom1', 'custom2']
}

const applyCachedImages = () => {
  for (const type of getImageTypes()) {
    const cached = getCachedThumb(tagThumbKey(props.meta.id, props.tag.id, type))
    if (cached) {
      images[type] = isThumbUnavailable(cached) ? null : cached
    }
  }
}

const getImages = () => {
  for (const type of getImageTypes()) {
    if (failedImageTypes.has(type)) continue

    const cacheKey = tagThumbKey(props.meta.id, props.tag.id, type)
    const cached = getCachedThumb(cacheKey)
    if (cached && !isThumbUnavailable(cached)) {
      images[type] = cached
      continue
    }

    if (images[type]) continue

    const src = resolveTagThumbDisplayUrl({
      dbPath: appStore.dbPath,
      metaId: props.meta.id,
      tagId: props.tag.id,
      type,
    })
    setCachedThumb(cacheKey, src)

    if (type !== 'main' && isThumbUnavailable(src)) {
      images[type] = null
    } else {
      images[type] = src
    }
  }
}

const onChipImageError = () => {
  const current = avatar.value
  if (current === images.avatar) {
    failedImageTypes.add('avatar')
    images.avatar = null
    return
  }
  if (current === images.main) {
    failedImageTypes.add('main')
    images.main = null
  }
}

const openTagPage = () => {
  router.push({
    path: '/tag',
    query: {
      metaId: props.meta.id,
      tagId: props.tag.id,
      mediaTypeId: getDefaultMediaTypeId(appStore.mediaTypes),
    },
  })
  hideHoverImage()
}

const getFlag = (name: string) => getCountryCode(name)

const clearLoadedImages = () => {
  failedImageTypes.clear()
  for (const type of getImageTypes()) {
    images[type] = null
  }
}

onMounted(() => {
  applyCachedImages()
  void getImages()
})

onBeforeUnmount(() => {
  clearLoadedImages()
})

watch(
  () => props.upd,
  (arr) => {
    if (arr.includes(props.tag.id)) {
      clearLoadedImages()
      getImages()
    }
  },
)

watch(
  () => itemsStore.thumbRefreshKeys[Number(props.tag.id)],
  (version, prev) => {
    if (version == null || version === prev) return
    clearLoadedImages()
    applyCachedImages()
    getImages()
  },
)
</script>
