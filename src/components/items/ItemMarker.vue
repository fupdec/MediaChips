<template>
  <div ref="rootRef" class="item" :class="{ 'item--plain-card': plainCard }">
    <v-card
      class="item-mark"
      :class="[{ 'no-file': !is_file_exists }]"
      :elevation="plainCard ? 2 : undefined"
    >
      <v-responsive
        @mouseover.capture="playPreview"
        @click="stopPlayingPreview"
        @mouseleave="stopPlayingPreview"
        @blur="stopPlayingPreview"
        v-ripple="{ class: 'primary--text' }"
        :aspect-ratio="16 / 9"
        class="video-preview-container"
      >
        <v-img
          @click="play"
          :src="thumb"
          :aspect-ratio="16 / 9"
          :key="`thumb_${mark.id}`"
          class="thumb"
          contain
          @error="onThumbError"
        ></v-img>

        <v-sheet class="time"
          light
          v-html="time"/>

        <div
          v-if="is_file_exists && is_hovered"
          @click="play"
          :style="`animation-delay: ${SETTINGS.delayVideoPreview}ms`"
          class="preview"
        >
          <video
            ref="video"
            :muted="muted"
            @error="playback_error = true"
            :class="{'video-playback-error': playback_error}"
            loop
          />
          <div v-if="playback_error"
            class="playback-error">
            {{ t('player.preview_format_unavailable') }}
          </div>
        </div>
      </v-responsive>

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
import {ref, computed, onMounted, onUnmounted, watch} from 'vue'
import type {PropType} from 'vue'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useItemsStore} from '@/stores/items'
import {useI18n} from 'vue-i18n'
import {useEventBus} from '@/utils/eventBus'
import {useLazyInView} from '@/composable/useLazyInView'
import {isMarkThumbUnavailable, loadMarkImageDisplayUrl} from '@/utils/markThumb'
import {resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import {checkFileExists as checkPathExists} from '@/services/fileService'
import {getReadableDuration} from '@/services/formatUtils'
import {toPlayableMediaItem} from '@/utils/mediaItem'
import {isAppWindowFocused} from '@/utils/windowFocus'
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
const settingsStore = useSettingsStore()
const itemsStore = useItemsStore()
const {t} = useI18n()
const eventBus = useEventBus()

const video = ref<HTMLVideoElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const {wasInView} = useLazyInView(rootRef)
const thumb = ref<string | undefined>(undefined)
const thumbFallbackApplied = ref(false)
const is_hovered = ref(false)
const is_file_exists = ref(false)
const playback_error = ref(false)
const previewTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
const videoLoadTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
const isVideoPlaying = ref(false)

// Computed
const apiUrl = computed(() => appStore.localhost)
const SETTINGS = computed(() => settingsStore)
const muted = computed(() => SETTINGS.value.play_sound_on_video_preview !== "1")

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

// Метод для безопасного воспроизведения видео
const safePlayVideo = () => {
  if (!video.value || !is_hovered.value || playback_error.value || !isAppWindowFocused()) return

  try {
    video.value.play().then(() => {
      isVideoPlaying.value = true
    }).catch((e: unknown) => {
      console.error('Error playing video:', e)
      playback_error.value = true
      isVideoPlaying.value = false
    })
  } catch (e) {
    console.error('Exception in safePlayVideo:', e)
    playback_error.value = true
    isVideoPlaying.value = false
  }
}

// Метод для безопасной остановки видео
const safeStopVideo = () => {
  if (video.value) {
    try {
      video.value.pause()
      isVideoPlaying.value = false

      // Сбрасываем обработчики событий
      video.value.oncanplay = null
      video.value.onerror = null
      video.value.ontimeupdate = null
    } catch (e) {
      console.error('Error stopping video:', e)
    }
  }
}

// Watch для отслеживания изменения is_hovered
watch(is_hovered, (newVal) => {
  if (!newVal) {
    safeStopVideo()
  }
})

watch(() => appStore.window.focused, (focused) => {
  if (!focused) {
    stopPlayingPreview()
  }
})

// Methods
const loadThumb = async () => {
  try {
    thumbFallbackApplied.value = false
    thumb.value = await loadMarkImageDisplayUrl({
      markId: props.mark.id,
      mediaPath: appStore.mediaPath,
      mediaId: props.mark.medium?.id || props.mark.mediumId,
    })
  } catch (e) {
    console.log('Error loading image:', e)
  }
}

const onThumbError = () => {
  if (thumbFallbackApplied.value) return

  const mediaId = props.mark.medium?.id || props.mark.mediumId
  if (!appStore.mediaPath || !mediaId) return

  const videoThumb = resolveMediaThumbDisplayUrl(appStore.mediaPath, 'videos', mediaId)
  if (isMarkThumbUnavailable(videoThumb)) return

  thumbFallbackApplied.value = true
  thumb.value = videoThumb!
}

const checkMarkFileExists = async () => {
  const mediumPath = props.mark.medium?.path
  is_file_exists.value = mediumPath ? await checkPathExists(mediumPath) : false
}

const playPreview = () => {
  if (!is_file_exists.value || is_hovered.value || !isAppWindowFocused()) return

  is_hovered.value = true

  // Очищаем предыдущий таймаут
  if (previewTimeout.value) {
    clearTimeout(previewTimeout.value)
    previewTimeout.value = null
  }

  previewTimeout.value = setTimeout(() => {
    if (!video.value || !is_hovered.value || !isAppWindowFocused()) return

    try {
      // Сбрасываем ошибку воспроизведения
      playback_error.value = false

      const medium = props.mark.medium
      const mediumId = medium?.id
      if (!mediumId) return

      const timeParam = markEnd.value != null
        ? `#t=${markTime.value},${markEnd.value}`
        : `#t=${markTime.value}`

      const videoSrc = apiUrl.value + "/api/video/" + mediumId + timeParam

      // Если источник уже установлен и видео то же самое
      if (video.value.src && video.value.src.includes(String(mediumId))) {
        video.value.currentTime = markTime.value
        safePlayVideo()
      } else {
        // Устанавливаем новый источник
        safeStopVideo()

        video.value.src = videoSrc
        video.value.currentTime = markTime.value

        // Очищаем предыдущий таймаут загрузки
        if (videoLoadTimeout.value) {
          clearTimeout(videoLoadTimeout.value)
        }

        // Устанавливаем обработчик canplay с проверкой
        video.value.oncanplay = () => {
          if (video.value && is_hovered.value && !playback_error.value && isAppWindowFocused()) {
            safePlayVideo()
          }
        }

        // Обработчик ошибок
        video.value.onerror = (e: Event | string) => {
          console.error('Video error:', e)
          playback_error.value = true
          isVideoPlaying.value = false
        }

        // Обработчик для зацикливания в рамках временного отрезка
        if (markEnd.value != null) {
          video.value.ontimeupdate = () => {
            if (video.value && markEnd.value != null && video.value.currentTime > markEnd.value) {
              video.value.currentTime = markTime.value
            }
          }
        }

        // Таймаут для загрузки видео
        videoLoadTimeout.value = setTimeout(() => {
          if (video.value && video.value.readyState < 2 && is_hovered.value) {
            video.value.load()
          }
        }, 100)
      }
    } catch (e) {
      console.error('Error in playPreview:', e)
      playback_error.value = true
      isVideoPlaying.value = false
    }
  }, Number(SETTINGS.value.delayVideoPreview) || 0)
}

const stopPlayingPreview = () => {
  is_hovered.value = false

  // Очищаем таймауты
  if (previewTimeout.value) {
    clearTimeout(previewTimeout.value)
    previewTimeout.value = null
  }

  if (videoLoadTimeout.value) {
    clearTimeout(videoLoadTimeout.value)
    videoLoadTimeout.value = null
  }

  safeStopVideo()
}

const play = () => {
  const videoItem = toPlayableMediaItem(props.mark.medium)
  if (!videoItem) return

  itemsStore.playVideo({
    video: videoItem,
    videos: [videoItem],
    time: markTime.value,
  })
  stopPlayingPreview()
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

onMounted(() => {
  eventBus.on('updateMarkImage', handleUpdateMarkImage)
})

onUnmounted(() => {
  eventBus.off('updateMarkImage', handleUpdateMarkImage)
  stopPlayingPreview()

  // Полная очистка при размонтировании
  if (video.value) {
    video.value.src = ''
    video.value.oncanplay = null
    video.value.onerror = null
    video.value.ontimeupdate = null
  }
})
</script>

<style lang="scss">
.item-mark {
  .video-preview-container {
    cursor: pointer;
  }
  &.no-file {
    .thumb {
      filter: saturate(0.1) opacity(50%);
    }
  }
  .preview {
    top: 0;
    left: 0;
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
    z-index: 1;
  }
}
</style>