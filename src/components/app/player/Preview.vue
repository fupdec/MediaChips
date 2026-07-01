<template>
  <Teleport to="#player .player-main">
    <div
      v-show="shouldShowPreview"
      :style="previewStyle"
      class="preview text-center"
    >
      <video
        :src="playerStore.player?.src"
        ref="preview"
        muted
        preload="metadata"
      />
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
  </Teleport>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, onBeforeUnmount} from 'vue'
import {usePlayerStore} from '@/stores/player'
import {getReadableDuration} from '@/services/formatUtils'
import throttle from 'lodash/throttle'

const SEEK_MIN_DELTA = 0.25
const PREVIEW_HEIGHT_VH = 15
const PREVIEW_TIMELINE_GAP = 50

const playerStore = usePlayerStore()
const preview = ref<HTMLVideoElement | null>(null)
const previewBottomPx = ref(130)

const aspectRatio = computed(() => {
  const item = playerStore.playlist[playerStore.nowPlaying] as { width?: number; height?: number } | undefined
  return (item?.width ?? 0) / (item?.height ?? 1) || 16 / 9
})

const previewStyle = computed(() => {
  const ratio = aspectRatio.value
  const halfWidth = `calc(${PREVIEW_HEIGHT_VH}vh * ${ratio} / 2 + 10px)`
  const hover = playerStore.progress_hover ?? 0

  return {
    left: `clamp(${halfWidth}, ${hover}%, calc(100% - ${halfWidth}))`,
    transform: 'translateX(-50%)',
    height: `clamp(100px, ${PREVIEW_HEIGHT_VH}vh, 180px)`,
    aspectRatio: String(ratio),
    bottom: `${previewBottomPx.value}px`,
  }
})

function updatePreviewAnchor() {
  const playerMain = document.querySelector('#player .player-main') as HTMLElement | null
  const timeline = document.querySelector('#player .controls .timeline') as HTMLElement | null
  if (!playerMain || !timeline) return

  const mainRect = playerMain.getBoundingClientRect()
  const timelineRect = timeline.getBoundingClientRect()
  previewBottomPx.value = Math.max(
    72,
    Math.round(mainRect.bottom - timelineRect.bottom + PREVIEW_TIMELINE_GAP),
  )
}

let previewAnchorObserver: ResizeObserver | null = null

onMounted(() => {
  updatePreviewAnchor()

  previewAnchorObserver = new ResizeObserver(updatePreviewAnchor)
  const playerMain = document.querySelector('#player .player-main')
  const controls = document.querySelector('#player .controls')
  if (playerMain) previewAnchorObserver.observe(playerMain)
  if (controls) previewAnchorObserver.observe(controls)

  window.addEventListener('resize', updatePreviewAnchor)
})

watch(
  () => [
    playerStore.progress_hover,
    playerStore.marksVisible,
    playerStore.playlistVisible,
    playerStore.isControlsVisible,
  ],
  () => {
    if (playerStore.progress_hover == null) return
    requestAnimationFrame(updatePreviewAnchor)
  },
)

const shouldShowPreview = computed(() => {
  return playerStore.is_file_exists &&
    playerStore.progress_hover != null &&
    !playerStore.is_mark_hover &&
    !playerStore.usesLiveTranscode
})

const formattedTime = computed(() => {
  const hover = Number(playerStore.progress_hover ?? 0)
  let time = playerStore.duration / 100 * hover
  if (hover < 0) {
    time = 0
  }
  return getReadableDuration(time)
})

const throttledSeek = throttle((time: number) => {
  const video = preview.value
  if (!video || !Number.isFinite(time)) return
  if (Math.abs(video.currentTime - time) < SEEK_MIN_DELTA) return

  video.pause()
  video.currentTime = time
}, 80, {leading: true, trailing: true})

function updatePreviewFrame() {
  if (playerStore.progress_hover == null) return

  const time = playerStore.duration / 100 * Number(playerStore.progress_hover)
  throttledSeek(time)
}

watch(() => playerStore.progress_hover, updatePreviewFrame)

onBeforeUnmount(() => {
  throttledSeek.cancel()
  previewAnchorObserver?.disconnect()
  previewAnchorObserver = null
  window.removeEventListener('resize', updatePreviewAnchor)
})
</script>
