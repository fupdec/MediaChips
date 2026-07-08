<template>
  <div class="edit-dialog-media-panel">
    <v-card variant="elevated" rounded="lg" elevation="3" class="edit-dialog-media-panel__card">
      <template v-if="mode === 'media'">
        <div class="edit-dialog-media-panel__image-wrap" :style="imageWrapStyle">
          <v-img :src="imageSrc ?? undefined" cover class="edit-dialog-media-panel__image">
            <DialogImageEditing
              v-if="imageSrc"
              :image="imageSrc"
              :options="cropperOptions"
              :image-path="imagePath ?? undefined"
              :min-width="minWidth"
              :min-height="mediaMinHeight"
              @edited="$emit('edited', $event)"
            />
          </v-img>
        </div>
      </template>

      <template v-else>
        <div
          class="edit-dialog-media-panel__image-wrap"
          :style="imageWrapStyle"
        >
          <v-img
            v-if="currentImage?.src"
            :src="currentImage.src"
            cover
            class="edit-dialog-media-panel__image"
          >
            <DialogImageEditing
              :image="currentImage.src"
              :options="tagCropperOptions"
              :image-path="currentImage.path"
              :min-width="currentImage.width"
              :min-height="currentImage.height"
              @edited="$emit('edited', $event)"
            />
          </v-img>
          <v-sheet
            v-else
            color="grey-darken-3"
            class="edit-dialog-media-panel__placeholder d-flex align-center justify-center"
            :style="imageWrapStyle"
          >
            <v-icon size="48" color="grey">mdi-image-off-outline</v-icon>
          </v-sheet>
        </div>

        <div v-if="images.length > 1" class="edit-dialog-media-panel__thumbs">
          <v-btn
            v-for="(item, index) in images"
            :key="item.key || `${item.type}-${index}`"
            :variant="index === currentIndex ? 'flat' : 'text'"
            :color="index === currentIndex ? 'primary' : undefined"
            size="x-small"
            class="text-none"
            @click="$emit('update:currentIndex', index)"
          >
            {{ item.type }}
          </v-btn>
        </div>
      </template>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent} from 'vue'
import type {PropType} from 'vue'

import type {ImageEditedPayload} from '@/components/dialogs/DialogImageEditing.vue'

const DialogImageEditing = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogImageEditing.vue'),
)

interface TagImage {
  type: string
  path: string
  src: string
  aspectRatio: number
  width: number
  height: number
  key: string
}

interface CropperOptions {
  aspectRatio?: number
  [key: string]: unknown
}

const props = defineProps({
  mode: {
    type: String as PropType<'media' | 'tag'>,
    default: 'media',
  },
  imageSrc: {
    type: String as PropType<string | null>,
    default: null,
  },
  imagePath: {
    type: String as PropType<string | null>,
    default: null,
  },
  cropperOptions: {
    type: Object as PropType<CropperOptions>,
    default: () => ({aspectRatio: 16 / 9}),
  },
  minWidth: {
    type: Number,
    default: 500,
  },
  images: {
    type: Array as PropType<TagImage[]>,
    default: () => [],
  },
  currentIndex: {
    type: Number,
    default: 0,
  },
})

defineEmits<{
  edited: [payload?: ImageEditedPayload]
  'update:currentIndex': [index: number]
}>()

const currentImage = computed((): TagImage | undefined => props.images[props.currentIndex])

const mediaMinHeight = computed(() => {
  const ratio = props.cropperOptions?.aspectRatio || 16 / 9
  return Math.max(1, Math.round(props.minWidth / ratio))
})

const imageWrapStyle = computed(() => {
  const ratio = props.mode === 'media'
    ? (props.cropperOptions?.aspectRatio || 16 / 9)
    : (currentImage.value?.aspectRatio || 1)

  return {
    aspectRatio: String(ratio),
  }
})

const tagCropperOptions = computed(() => ({
  aspectRatio: currentImage.value?.aspectRatio || 1,
  viewMode: 1,
  autoCropArea: 1,
  movable: true,
  rotatable: true,
  scalable: true,
  zoomable: true,
  cropBoxMovable: true,
  cropBoxResizable: true,
}))
</script>
