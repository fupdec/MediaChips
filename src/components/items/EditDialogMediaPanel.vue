<template>
  <div class="edit-dialog-media-panel">
    <v-card
      variant="flat"
      class="edit-dialog-media-panel__card"
      :class="{'edit-dialog-media-panel__card--video': isVideoPanel}"
    >
      <template v-if="isVideoPanel">
        <div
          class="edit-dialog-media-panel__image-wrap edit-dialog-media-panel__image-wrap--video"
          :style="imageWrapStyle"
        >
          <ItemPreviewVideo
            :key="videoThumbRemountKey"
            :media="media!"
            :is-file-exists="isFileExists"
            :thumb-url="imageSrc || undefined"
            preview-host="embedded"
            @update-big-preview="$emit('update-big-preview', $event)"
          />
        </div>
        <div class="edit-dialog-media-panel__controls">
          <div class="edit-dialog-media-panel__toolbar">
            <span class="edit-dialog-media-panel__toolbar-label">{{ t('image.thumbnail') }}</span>
            <div class="edit-dialog-media-panel__toolbar-actions">
              <DialogImageEditing
                v-if="imageSrc"
                detached
                compact
                :image="imageSrc"
                :options="cropperOptions"
                :image-path="imagePath ?? undefined"
                :min-width="minWidth"
                :min-height="mediaMinHeight"
                @edited="$emit('edited', $event)"
              />
              <v-btn
                size="small"
                variant="tonal"
                color="primary"
                icon
                v-tooltip:top="t('image.create_thumb_random')"
                :loading="isCreatingThumb === 'random'"
                :disabled="!canCreateThumb || isCreatingThumb != null"
                @click="createVideoThumb('random')"
              >
                <v-icon size="18">mdi-dice-5-outline</v-icon>
              </v-btn>
              <v-btn
                size="small"
                variant="tonal"
                color="primary"
                icon
                v-tooltip:top="t('image.create_thumb_default')"
                :loading="isCreatingThumb === 'default'"
                :disabled="!canCreateThumb || isCreatingThumb != null"
                @click="createVideoThumb('default')"
              >
                <v-icon size="18">mdi-image-frame</v-icon>
              </v-btn>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="mode === 'media'">
        <div class="edit-dialog-media-panel__image-wrap" :style="imageWrapStyle">
          <v-img
            :src="imageSrc ?? undefined"
            cover
            position="top center"
            class="edit-dialog-media-panel__image"
          />
        </div>
        <div v-if="imageSrc" class="edit-dialog-media-panel__controls">
          <div class="edit-dialog-media-panel__toolbar">
            <span class="edit-dialog-media-panel__toolbar-label">{{ t('image.thumbnail') }}</span>
            <div class="edit-dialog-media-panel__toolbar-actions">
              <DialogImageEditing
                detached
                compact
                :image="imageSrc"
                :options="cropperOptions"
                :image-path="imagePath ?? undefined"
                :min-width="minWidth"
                :min-height="mediaMinHeight"
                @edited="$emit('edited', $event)"
              />
            </div>
          </div>
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
            position="top center"
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
        <div
          v-if="currentImage || images.length > 1"
          class="edit-dialog-media-panel__controls"
        >
          <div v-if="currentImage" class="edit-dialog-media-panel__toolbar">
            <span class="edit-dialog-media-panel__toolbar-label">{{ t('image.thumbnail') }}</span>
            <div class="edit-dialog-media-panel__toolbar-actions">
              <DialogImageEditing
                detached
                compact
                :image="currentImage.src || ''"
                :options="tagCropperOptions"
                :image-path="currentImage.path"
                :min-width="currentImage.width"
                :min-height="currentImage.height"
                @edited="$emit('edited', $event)"
              />
            </div>
          </div>

          <div v-if="images.length > 1" class="edit-dialog-media-panel__thumbs">
            <button
              v-for="(item, index) in images"
              :key="item.key || `${item.type}-${index}`"
              type="button"
              class="edit-dialog-media-panel__thumb-opt"
              :class="{
                'edit-dialog-media-panel__thumb-opt--active': index === currentIndex,
                'edit-dialog-media-panel__thumb-opt--exists': !item.missing,
                'edit-dialog-media-panel__thumb-opt--missing': !!item.missing,
              }"
              @click="$emit('update:currentIndex', index)"
            >
              <span
                v-if="!item.missing"
                class="edit-dialog-media-panel__thumb-dot"
                aria-hidden="true"
              />
              <span class="edit-dialog-media-panel__thumb-label">{{ item.type }}</span>
            </button>
          </div>
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

/** Remount when the parent cache-busts imageSrc after scrape/thumb rewrite. */
const videoThumbRemountKey = computed(() => {
  const mediaId = props.media?.id ?? 'media'
  return `edit-video-thumb-${mediaId}-${props.imageSrc || 'empty'}`
})

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
    itemsStore.refreshThumb(media.id)
    emit('edited')
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
