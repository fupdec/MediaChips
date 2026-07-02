<template>
  <div
    v-show="shouldShowPreview"
    :style="previewStyle"
    class="preview text-center"
  >
    <img
      v-if="useTimelineFrames"
      :key="timelineFrameKey"
      :src="timelineFrameUrl ?? undefined"
      class="preview-frame"
      alt=""
      @error="onTimelineFrameError"
    >
    <video
      v-else
      ref="preview"
      muted
      preload="metadata"
    />

    <div
      v-if="useTimelineFrames && showTimelineGenerating"
      class="preview-generating"
    >
      <v-progress-circular
        color="white"
        indeterminate
        size="28"
        width="2"
      />
    </div>

    <div class="time">
      <v-chip
        color="black"
        density="compact"
        size="small"
        theme="dark"
        variant="flat"
      >{{ formattedTime }}
      </v-chip>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onBeforeUnmount} from 'vue'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {usePlayerStore} from '@/stores/player'
import {useTasksStore} from '@/stores/tasks'
import {getReadableDuration} from '@/services/formatUtils'
import {typedApi} from '@/services/typedApi'
import {pickTimelineFramePercent, getPlayerPreviewAspectRatio} from '@/utils/playerPreviewPosition'
import {
  isThumbUnavailable,
  resolveMediaThumbDisplayUrl,
  resolveTimelineFrameDisplayUrl,
} from '@/utils/thumbSource'
import throttle from 'lodash/throttle'

const SEEK_MIN_DELTA = 0.25

const appStore = useAppStore()
const itemsStore = useItemsStore()
const playerStore = usePlayerStore()
const tasksStore = useTasksStore()

const preview = ref<HTMLVideoElement | null>(null)
const timelineGenRequestedFor = ref<number | null>(null)
const timelineFrameCacheBust = ref(0)
const timelineFrameFailed = ref(false)

const useTimelineFrames = computed(() => playerStore.usesLiveTranscode)

const aspectRatio = computed(() =>
  getPlayerPreviewAspectRatio(playerStore.playlist, playerStore.nowPlaying),
)

const previewStyle = computed(() => {
  const ratio = aspectRatio.value
  const hover = playerStore.progress_hover ?? 0
  const halfWidth = `calc(15vh * ${ratio} / 2 + 10px)`

  return {
    left: `clamp(${halfWidth}, ${hover}%, calc(100% - ${halfWidth}))`,
    transform: 'translateX(-50%)',
    aspectRatio: String(ratio),
  }
})

const shouldShowPreview = computed(() => {
  return Boolean(playerStore.media?.id) &&
    playerStore.is_file_exists &&
    playerStore.progress_hover != null &&
    !playerStore.is_mark_hover
})

const formattedTime = computed(() => {
  const hover = Number(playerStore.progress_hover ?? 0)
  let time = playerStore.duration / 100 * hover
  if (hover < 0) {
    time = 0
  }
  return getReadableDuration(time)
})

const timelineFramePercent = computed(() => {
  if (playerStore.progress_hover == null) return null
  return pickTimelineFramePercent(playerStore.progress_hover)
})

const fallbackThumbUrl = computed(() => {
  const mediaId = playerStore.media?.id
  if (!mediaId) return null
  return resolveMediaThumbDisplayUrl(appStore.mediaPath, 'videos', mediaId)
})

const timelineFrameUrl = computed(() => {
  const mediaId = playerStore.media?.id
  const percent = timelineFramePercent.value
  if (!mediaId || percent == null) return null

  if (timelineFrameFailed.value && fallbackThumbUrl.value && !isThumbUnavailable(fallbackThumbUrl.value)) {
    return fallbackThumbUrl.value
  }

  return resolveTimelineFrameDisplayUrl(
    appStore.mediaPath,
    mediaId,
    percent,
    timelineFrameCacheBust.value > 0,
  )
})

const timelineFrameKey = computed(() => {
  const mediaId = playerStore.media?.id ?? 'none'
  const percent = timelineFramePercent.value ?? 0
  return `${mediaId}-${percent}-${timelineFrameCacheBust.value}`
})

const isGeneratingTimeline = computed(() =>
  tasksStore.list.some((task) => task.title === 'Generating timeline images'),
)

const showTimelineGenerating = computed(() =>
  useTimelineFrames.value &&
  (isGeneratingTimeline.value || timelineGenRequestedFor.value === playerStore.media?.id) &&
  timelineFrameFailed.value,
)

const requestTimelineGeneration = () => {
  const media = playerStore.media
  if (!media?.id || !media.path) return
  if (timelineGenRequestedFor.value === media.id) return

  timelineGenRequestedFor.value = media.id
  typedApi.taskCreateTimeline({id: media.id, path: media.path})
    .then(() => {
      itemsStore.refreshThumb(media.id, {broadcast: false})
      timelineFrameCacheBust.value++
      timelineFrameFailed.value = false
    })
    .catch(() => {})
}

const onTimelineFrameError = () => {
  timelineFrameFailed.value = true
  requestTimelineGeneration()
}

const syncPreviewFrame = () => {
  if (useTimelineFrames.value || playerStore.progress_hover == null) return

  const video = preview.value
  const playerSrc = playerStore.player?.src
  if (!video || !playerSrc) return

  const time = playerStore.duration / 100 * Number(playerStore.progress_hover)
  if (!Number.isFinite(time)) return

  if (video.src !== playerSrc) {
    video.src = playerSrc
  }

  if (Math.abs(video.currentTime - time) >= SEEK_MIN_DELTA) {
    video.pause()
    video.currentTime = time
  }
}

const throttledSyncPreviewFrame = throttle(syncPreviewFrame, 80, {leading: true, trailing: true})

watch(
  () => (playerStore.usesLiveTranscode ? playerStore.media?.id : null),
  (mediaId) => {
    if (mediaId == null) return
    requestTimelineGeneration()
  },
)

watch(() => playerStore.progress_hover, () => {
  if (useTimelineFrames.value) {
    timelineFrameFailed.value = false
    return
  }
  throttledSyncPreviewFrame()
})

watch(() => playerStore.media?.id, () => {
  timelineGenRequestedFor.value = null
  timelineFrameCacheBust.value = 0
  timelineFrameFailed.value = false
  const video = preview.value
  if (video) {
    video.removeAttribute('src')
    video.load()
  }
})

watch(
  () => itemsStore.thumbRefreshKeys[Number(playerStore.media?.id)],
  () => {
    timelineFrameCacheBust.value++
    timelineFrameFailed.value = false
  },
)

onBeforeUnmount(() => {
  throttledSyncPreviewFrame.cancel()
})
</script>
