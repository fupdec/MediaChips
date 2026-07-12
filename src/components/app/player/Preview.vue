<template>
  <div
    v-show="shouldShowPreview"
    :style="previewStyle"
    class="preview text-center"
  >
    <div
      v-if="useTimelineFrames && gridFrameStyle"
      :key="gridFrameKey"
      class="preview-frame grid-sprite-frame"
      :style="gridFrameStyle"
    />
    <video
      v-else-if="!useTimelineFrames"
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
import {pickGridFrameIndex, getPlayerPreviewAspectRatio} from '@/utils/playerPreviewPosition'
import {buildContainedThumbFallbackStyle, buildGridSpriteFrameStyle} from '@/utils/gridSprite'
import {buildVideoGridTaskParams} from '@shared/videoPreview'
import {
  isThumbUnavailable,
  resolveGridSpriteDisplayUrl,
  resolveMediaThumbDisplayUrl,
} from '@/utils/thumbSource'
import {probeDisplayImageUrl} from '@/utils/probeImageUrl'
import throttle from 'lodash/throttle'

const SEEK_MIN_DELTA = 0.25

const appStore = useAppStore()
const itemsStore = useItemsStore()
const playerStore = usePlayerStore()
const tasksStore = useTasksStore()

const preview = ref<HTMLVideoElement | null>(null)
const gridGenRequestedFor = ref<number | null>(null)
const gridFrameCacheBust = ref(0)
const gridFrameFailed = ref(false)

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

const gridFrameIndex = computed(() => {
  if (playerStore.progress_hover == null) return null
  return pickGridFrameIndex(playerStore.progress_hover)
})

const fallbackThumbUrl = computed(() => {
  const mediaId = playerStore.media?.id
  if (!mediaId) return null
  return resolveMediaThumbDisplayUrl(appStore.mediaPath, 'videos', mediaId)
})

const gridSpriteUrl = computed(() => {
  const mediaId = playerStore.media?.id
  if (!mediaId) return null

  if (gridFrameFailed.value && fallbackThumbUrl.value && !isThumbUnavailable(fallbackThumbUrl.value)) {
    return fallbackThumbUrl.value
  }

  return resolveGridSpriteDisplayUrl(
    appStore.mediaPath,
    mediaId,
    gridFrameCacheBust.value > 0,
  )
})

const gridFrameStyle = computed(() => {
  const spriteUrl = gridSpriteUrl.value
  const frameIndex = gridFrameIndex.value
  if (!spriteUrl || frameIndex == null) return null

  if (gridFrameFailed.value && fallbackThumbUrl.value && spriteUrl === fallbackThumbUrl.value) {
    return buildContainedThumbFallbackStyle(
      spriteUrl,
      aspectRatio.value,
      aspectRatio.value,
    )
  }

  return buildGridSpriteFrameStyle(
    spriteUrl,
    frameIndex,
    aspectRatio.value,
    aspectRatio.value,
  )
})

const gridFrameKey = computed(() => {
  const mediaId = playerStore.media?.id ?? 'none'
  const frameIndex = gridFrameIndex.value ?? 0
  return `${mediaId}-${frameIndex}-${gridFrameCacheBust.value}`
})

const isGeneratingGrid = computed(() =>
  tasksStore.list.some((task) => task.title === 'Generating grids images'),
)

const showTimelineGenerating = computed(() =>
  useTimelineFrames.value &&
  (isGeneratingGrid.value || gridGenRequestedFor.value === playerStore.media?.id) &&
  gridFrameFailed.value,
)

const requestGridGeneration = () => {
  const media = playerStore.media
  if (!media?.id || !media.path) return
  if (gridGenRequestedFor.value === media.id) return

  gridGenRequestedFor.value = media.id
  typedApi.taskCreateGrid(buildVideoGridTaskParams(media.path, `${media.id}.jpg`))
    .then(() => {
      itemsStore.refreshThumb(media.id, {broadcast: false})
      gridFrameCacheBust.value++
      gridFrameFailed.value = false
    })
    .catch(() => {})
}

const onGridFrameError = () => {
  gridFrameFailed.value = true
  requestGridGeneration()
}

const probeGridSprite = async () => {
  const spriteUrl = resolveGridSpriteDisplayUrl(
    appStore.mediaPath,
    playerStore.media?.id ?? '',
    gridFrameCacheBust.value > 0,
  )
  if (!spriteUrl || isThumbUnavailable(spriteUrl)) {
    onGridFrameError()
    return
  }

  const exists = await probeDisplayImageUrl(spriteUrl)
  if (!exists) {
    onGridFrameError()
  } else {
    gridFrameFailed.value = false
  }
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
    void probeGridSprite()
    requestGridGeneration()
  },
)

watch(() => playerStore.progress_hover, () => {
  if (useTimelineFrames.value) {
    gridFrameFailed.value = false
    return
  }
  throttledSyncPreviewFrame()
})

watch(() => playerStore.media?.id, () => {
  gridGenRequestedFor.value = null
  gridFrameCacheBust.value = 0
  gridFrameFailed.value = false
  const video = preview.value
  if (video) {
    video.removeAttribute('src')
    video.load()
  }
})

watch(
  () => itemsStore.thumbRefreshKeys[Number(playerStore.media?.id)],
  () => {
    gridFrameCacheBust.value++
    gridFrameFailed.value = false
  },
)

onBeforeUnmount(() => {
  throttledSyncPreviewFrame.cancel()
})
</script>
