<template>
  <div class="edit-dialog-media-panel">
    <v-card
      variant="elevated"
      rounded="lg"
      elevation="3"
      class="edit-dialog-media-panel__card"
      :class="{'edit-dialog-media-panel__card--video': isVideoPanel}"
    >
      <template v-if="isVideoPanel">
        <div
          class="edit-dialog-media-panel__image-wrap edit-dialog-media-panel__image-wrap--video"
          :style="imageWrapStyle"
        >
          <ItemPreviewVideo
            :media="media!"
            :is-file-exists="isFileExists"
            preview-host="embedded"
            @update-big-preview="$emit('update-big-preview', $event)"
          />
        </div>
        <div class="edit-dialog-media-panel__thumb-actions">
          <div class="text-medium-emphasis text-caption px-1">{{ t('image.thumbnail') }}</div>
          <DialogImageEditing
            v-if="imageSrc"
            detached
            activator-class="edit-dialog-media-panel__thumb-btn"
            :image="imageSrc"
            :options="cropperOptions"
            :image-path="imagePath ?? undefined"
            :min-width="minWidth"
            :min-height="mediaMinHeight"
            @edited="$emit('edited', $event)"
          />
          <v-btn
            size="small"
            variant="flat"
            color="primary"
            rounded="xl"
            prepend-icon="mdi-dice-5-outline"
            :text="t('image.create_thumb_random')"
            :loading="isCreatingThumb === 'random'"
            :disabled="!canCreateThumb || isCreatingThumb != null"
            @click="createVideoThumb('random')"
          />
          <v-btn
            size="small"
            variant="flat"
            color="primary"
            rounded="xl"
            prepend-icon="mdi-image-frame"
            :text="t('image.create_thumb_default')"
            :loading="isCreatingThumb === 'default'"
            :disabled="!canCreateThumb || isCreatingThumb != null"
            @click="createVideoThumb('default')"
          />
        </div>
      </template>

      <template v-else-if="mode === 'media'">
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
          />
          <v-sheet
            v-else
            color="grey-darken-3"
            class="edit-dialog-media-panel__placeholder d-flex align-center justify-center"
            :style="imageWrapStyle"
          >
            <v-icon size="48" color="grey">mdi-image-off-outline</v-icon>
          </v-sheet>
        </div>

        <div class="edit-dialog-media-panel__thumb-actions">
          <div class="text-medium-emphasis text-caption px-1">
            {{ currentImage?.type || t('image.thumbnail') }}
          </div>
          <DialogImageEditing
            v-if="currentImage"
            detached
            activator-class="edit-dialog-media-panel__thumb-btn"
            :image="currentImage.src || ''"
            :options="tagCropperOptions"
            :image-path="currentImage.path"
            :min-width="currentImage.width"
            :min-height="currentImage.height"
            @edited="$emit('edited', $event)"
          />
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
import {computed, defineAsyncComponent, ref} from 'vue'
import type {PropType} from 'vue'
import {useI18n} from 'vue-i18n'

import type {ImageEditedPayload} from '@/components/dialogs/DialogImageEditing.vue'
import type {MediaItem} from '@/types/stores'
import ItemPreviewVideo from '@/components/items/ItemPreviewVideo.vue'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {invalidateVideoThumbCaches} from '@/utils/thumbDisplayCache'
import {useItemsStore} from '@/stores/items'

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
  missing?: boolean
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
  isVideoMedia: {
    type: Boolean,
    default: false,
  },
  media: {
    type: Object as PropType<MediaItem | null>,
    default: null,
  },
  isFileExists: {
    type: Boolean,
    default: true,
  },
})

const emit = defineEmits<{
  edited: [payload?: ImageEditedPayload]
  'update:currentIndex': [index: number]
  'update-big-preview': [value: boolean]
}>()

const {t} = useI18n()
const itemsStore = useItemsStore()
const isCreatingThumb = ref<'random' | 'default' | null>(null)

const currentImage = computed((): TagImage | undefined => props.images[props.currentIndex])

const isVideoPanel = computed(() =>
  props.mode === 'media' && props.isVideoMedia && props.media != null,
)

const canCreateThumb = computed(() =>
  Boolean(props.isFileExists && props.media?.id != null && props.media?.path),
)

async function createVideoThumb(mode: 'random' | 'default') {
  const media = props.media
  if (!media?.id || !media.path || isCreatingThumb.value) return

  isCreatingThumb.value = mode
  try {
    await typedApi.taskCreateThumbForVideo({
      path: media.path,
      id: media.id,
      seekRatio: mode === 'random' ? Math.random() : 0.5,
    })
    invalidateVideoThumbCaches(media.id)
    itemsStore.refreshThumb(media.id, {regenerate: true})
    emit('edited')
    setNotification({
      title: t('player.video_thumb_updated'),
      text: media.path,
      icon: 'image',
      type: 'success',
    })
  } catch (e) {
    console.error(e)
    setNotification({
      title: t('player.video_thumb_not_updated'),
      text: String(e),
      icon: 'image',
      type: 'error',
    })
  } finally {
    isCreatingThumb.value = null
  }
}

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
