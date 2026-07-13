<template>
  <div
    ref="rootRef"
    class="item"
    :class="{
      'item--plain-card': plainCard,
      'big-preview': bigPreview,
    }"
  >
    <v-card
      class="item-mark"
      :class="[{ 'no-file': !isFileExists }]"
      :elevation="plainCard ? 2 : undefined"
    >
      <div class="item-mark__preview">
        <ItemPreviewVideo
          v-if="videoMedia"
          :media="videoMedia"
          :is-file-exists="isFileExists"
          preview-host="compact"
          v-bind="thumb ? { thumbUrl: thumb } : {}"
          :preview-start-time="markTime"
          :preview-end-time="markEnd"
          :play-time="markTime"
          @update-big-preview="bigPreview = $event"
        />

        <v-sheet
          class="time"
          light
          v-html="time"
        />
      </div>

      <v-card-subtitle
        style="overflow:hidden; white-space:nowrap; text-overflow: ellipsis;"
        :title="mark.medium?.name || mark.medium?.basename || ''"
        class="mt-4"
      >{{ mark.medium?.name || mark.medium?.basename || t('common.unknown') }}
      </v-card-subtitle>
      <v-card-text>
        <v-chip v-if="mark.type === 'meta'"
          :color="mark.tag?.color || 'primary'"
          size="small">
          <v-icon start
            size="small">mdi-{{ mark.tag?.meta?.icon || 'tag' }}
          </v-icon>
          <span>{{ mark.tag?.name || t('common.unknown') }}</span>
        </v-chip>
        <v-chip v-else-if="mark.type === 'favorite'"
          size="small">
          <v-icon color="pink"
            start
            size="small">mdi-heart
          </v-icon>
          <span>{{ t('meta.default_names.favorite') }}</span>
        </v-chip>
        <v-chip v-else-if="mark.type === 'bookmark'"
          :title="mark.text"
          size="small">
          <v-icon color="red"
            start
            size="small">mdi-bookmark
          </v-icon>
          <span>{{ t('meta.default_names.bookmark') }}</span>
        </v-chip>
      </v-card-text>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, onUnmounted} from 'vue'
import type {PropType} from 'vue'
import {useAppStore} from '@/stores/app'
import {useI18n} from 'vue-i18n'
import {useEventBus} from '@/utils/eventBus'
import {useLazyInView} from '@/composable/useLazyInView'
import {loadMarkImageDisplayUrl} from '@/utils/markThumb'
import {checkFileExists as checkPathExists} from '@/services/fileService'
import {getReadableDuration} from '@/services/formatUtils'
import {toPlayableMediaItem} from '@/utils/mediaItem'
import ItemPreviewVideo from '@/components/items/ItemPreviewVideo.vue'
import type {MarkItem} from '@/types/stores'

interface ItemMarkerMedium {
  id?: number
  path?: string
  name?: string
  basename?: string
}

interface ItemMarkerTag {
  color?: string
  name?: string
  meta?: { icon?: string }
}

interface ItemMarkerMark extends MarkItem {
  time?: number
  end?: number
  type?: string
  text?: string
  mediumId?: number
  medium?: ItemMarkerMedium
  tag?: ItemMarkerTag
}

const props = defineProps({
  mark: {
    type: Object as PropType<ItemMarkerMark>,
    required: true,
  },
  plainCard: {
    type: Boolean,
    default: false,
  },
})

const appStore = useAppStore()
const {t} = useI18n()
const eventBus = useEventBus()

const rootRef = ref<HTMLElement | null>(null)
const {wasInView} = useLazyInView(rootRef)
const thumb = ref<string | undefined>(undefined)
const isFileExists = ref(false)
const bigPreview = ref(false)

const videoMedia = computed(() => toPlayableMediaItem(props.mark.medium))

const markTime = computed(() => Number(props.mark.time) || 0)
const markEnd = computed(() => {
  const end = props.mark.end
  return typeof end === 'number' ? end : null
})

const time = computed(() => {
  const startTime = getReadableDuration(markTime.value)
  if (markEnd.value != null) {
    return startTime + " – " + getReadableDuration(markEnd.value)
  }
  return startTime
})

const loadThumb = async () => {
  try {
    thumb.value = await loadMarkImageDisplayUrl({
      markId: props.mark.id,
      mediaPath: appStore.mediaPath,
      mediaId: props.mark.medium?.id || props.mark.mediumId,
    })
  } catch (e) {
    console.log('Error loading image:', e)
  }
}

const checkMarkFileExists = async () => {
  const mediumPath = props.mark.medium?.path
  isFileExists.value = mediumPath ? await checkPathExists(mediumPath) : false
}

const handleUpdateMarkImage = (id: unknown) => {
  if (props.mark.id === id) {
    void loadThumb()
  }
}

watch(wasInView, (visible) => {
  if (!visible) return
  void loadThumb()
  void checkMarkFileExists()
})

watch(() => props.mark.id, () => {
  void loadThumb()
  void checkMarkFileExists()
})

onMounted(() => {
  eventBus.on('updateMarkImage', handleUpdateMarkImage)
})

onUnmounted(() => {
  eventBus.off('updateMarkImage', handleUpdateMarkImage)
})
</script>

<style lang="scss">
.item-mark {
  .item-mark__preview {
    position: relative;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    cursor: pointer;
    border-radius: 4px;

    .video-preview-host--compact {
      position: absolute;
      inset: 0;
      height: 100%;
      border-radius: inherit;
    }

    .video-preview-container,
    .video-preview-host__anchor {
      border-radius: inherit;
    }

    .video-preview-container {
      height: 100%;
    }
  }

  &.no-file {
    .thumb {
      filter: saturate(0.1) opacity(50%);
    }
  }

  .time {
    pointer-events: none;
    position: absolute;
    bottom: 5px;
    right: 5px;
    background: rgb(255 255 255 / 80%);
    padding: 0 7px;
    border-radius: 15px;
    font-size: 14px;
    z-index: 3;
  }
}
</style>
