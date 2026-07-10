<template>
  <v-responsive
    :aspect-ratio="aspectRatio"
    :max-width="maxWidth"
    class="tag-main-image-wrap tag-page-gallery"
  >
    <div
      v-if="images.length > 1"
      class="tag-page-gallery__frame rounded-xl"
    >
      <v-carousel
        v-model="currentIndex"
        class="tag-page-gallery__carousel"
        height="100%"
        :show-arrows="false"
        hide-delimiter-background
      >
        <v-carousel-item
          v-for="item in images"
          :key="item.type"
          class="tag-page-gallery__item"
        >
          <v-img
            :src="item.src"
            cover
            :class="{'main-img': hoverReveal}"
            class="tag-page-gallery__image"
          />
        </v-carousel-item>
      </v-carousel>
    </div>

    <v-img
      v-else-if="images[0]"
      :src="images[0].src"
      rounded="xl"
      cover
      :class="{'main-img': hoverReveal}"
      class="tag-page-gallery__image"
    />
  </v-responsive>
</template>

<script setup lang="ts">
import {ref, watch} from 'vue'

export interface TagPageGalleryImage {
  type: string
  src: string
}

const props = withDefaults(defineProps<{
  images: TagPageGalleryImage[]
  aspectRatio?: number
  maxWidth?: number
  hoverReveal?: boolean
}>(), {
  aspectRatio: 1,
  maxWidth: undefined,
  hoverReveal: false,
})

const currentIndex = ref(0)

watch(
  () => props.images,
  (items) => {
    if (currentIndex.value >= items.length) {
      currentIndex.value = 0
    }
  },
)
</script>
