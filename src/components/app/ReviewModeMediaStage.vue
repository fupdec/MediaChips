<template>
  <div
    class="review-stage-media"
    :style="{'--review-ar': String(mediaAspectRatio)}"
  >
    <template v-if="isVideo">
      <div
        v-if="gridReady"
        class="review-stage-media__grid"
        :style="gridStageStyle"
        @mouseenter="cancelLeaveStopPreviews"
        @mouseleave="scheduleLeaveStopPreviews"
        @focusin="cancelLeaveStopPreviews"
        @focusout="onGridFocusOut"
      >
        <button
          v-for="index in tileIndexes"
          :key="index"
          type="button"
          class="review-stage-media__tile"
          :class="{'review-stage-media__tile--active': activeTile === index}"
          :aria-label="t('review_mode.tile_clip', {index: index + 1})"
          @mouseenter="setActiveTile(index)"
          @focus="setActiveTile(index)"
          @click.stop="onTileClick(index)"
        >
          <span
            class="review-stage-media__tile-sprite"
            :style="tileStyles[index]"
            aria-hidden="true"
          />
          <Transition name="review-clip">
            <video
              v-if="!previewUnavailable && clipArmed && activeTile === index && clipUrl"
              :key="`${props.media?.id ?? 0}-${index}`"
              :ref="setVideoRef"
              class="review-stage-media__clip"
              :class="{'review-stage-media__clip--visible': clipVisible}"
              muted
              playsinline
              preload="metadata"
              :src="clipUrl"
              @timeupdate="onClipTimeUpdate"
              @error="onClipError"
            />
          </Transition>
          <span
            v-if="!previewUnavailable && clipArmed && activeTile === index && clipWindow"
            class="review-stage-media__tile-badge"
            :class="{'review-stage-media__tile-badge--visible': clipVisible}"
          >
            {{ formatReviewDuration(clipWindow?.start) }}
          </span>
        </button>

        <div
          v-if="previewUnavailable"
          class="review-stage-media__preview-unavailable"
          role="status"
        >
          <v-icon size="18" class="review-stage-media__preview-unavailable-icon">
            mdi-alert-outline
          </v-icon>
          <span>{{ t('player.preview_format_unavailable') }}</span>
        </div>
      </div>

      <div
        v-else
        class="review-stage-media__fallback"
        :style="gridStageStyle"
      >
        <v-img
          v-if="thumbUrl"
          :src="thumbUrl"
          cover
          class="review-stage-media__thumb"
        />
        <div
          v-else-if="!waitingUrl"
          class="review-stage-media__thumb review-stage-media__thumb--empty"
        >
          <v-icon size="56" color="white">mdi-movie-open-outline</v-icon>
        </div>

        <video
          v-if="waitingUrl"
          :ref="setWaitingVideoRef"
          class="review-stage-media__waiting-video"
          :class="{'review-stage-media__waiting-video--visible': waitingVisible}"
          muted
          playsinline
          preload="metadata"
          :src="waitingUrl"
          @click.stop="emit('playFull')"
          @error="onWaitingError"
        />

        <div
          v-if="showGridProgress"
          class="review-stage-media__progress"
        >
          <div
            v-if="generatingGrid"
            class="review-stage-media__progress-label text-caption"
          >
            {{ t('review_mode.generating_grid') }}
          </div>
          <v-progress-linear
            color="primary"
            height="5"
            rounded
            indeterminate
          />
        </div>

        <div
          v-else-if="gridError"
          class="review-stage-media__fallback-actions"
        >
          <div class="text-caption text-error mb-2">
            {{ gridError }}
          </div>
          <v-btn
            color="primary"
            variant="flat"
            rounded="xl"
            size="small"
            :disabled="!canGenerateGrid"
            prepend-icon="mdi-grid"
            @click.stop="generateGrid({manual: true})"
          >
            {{ t('review_mode.generate_grid') }}
          </v-btn>
        </div>

        <div
          v-if="previewUnavailable && !showGridProgress"
          class="review-stage-media__preview-unavailable"
          role="status"
        >
          <v-icon size="18" class="review-stage-media__preview-unavailable-icon">
            mdi-alert-outline
          </v-icon>
          <span>{{ t('player.preview_format_unavailable') }}</span>
        </div>
      </div>
    </template>

    <template v-else-if="isImage">
      <img
        v-if="stillUrl"
        :src="stillUrl"
        class="review-stage-media__image"
        alt=""
      >
      <div
        v-else
        class="review-stage-media__thumb review-stage-media__thumb--empty"
      >
        <v-icon size="56" color="white">mdi-image-off-outline</v-icon>
      </div>
    </template>

    <template v-else>
      <v-img
        v-if="stillUrl"
        :src="stillUrl"
        cover
        class="review-stage-media__thumb"
      />
      <div
        v-else
        class="review-stage-media__thumb review-stage-media__thumb--empty"
      >
        <v-icon size="56" color="white">mdi-image-off-outline</v-icon>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import path from 'path-browserify'
import {buildApiUrl} from '@/services/apiClient'
import {typedApi} from '@/services/typedApi'
import {
  buildLocalFileUrl,
  checkFileExists,
  invalidateFileExistsCache,
} from '@/services/fileService'
import {
  buildVideoStreamUrl,
  fetchPlayableInfo,
} from '@/services/transcodeService'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {
  resolveHoverPreviewSourcePlan,
  shouldApplyPreviewSeek,
  shouldRestartFixedPreviewClip,
} from '@/utils/hoverPreviewPlayback'
import {
  isHoverPreviewUnavailableCached,
  markHoverPreviewUnavailableCached,
} from '@/utils/hoverPreviewUnavailableCache'
import {resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import {invalidateVideoThumbCaches} from '@/utils/thumbDisplayCache'
import {GRID_FRAME_INDEXES, PREVIEW_CONTAINER_ASPECT_RATIO, buildGridSpriteBackgroundStyle} from '@/utils/gridSprite'
import {getMediaAspectRatio} from '@/utils/gridLayout'
import {
  formatReviewDuration,
  reviewTileClipWindow,
  type ReviewTileClipWindow,
} from '@/utils/reviewModeTrailers'
import {buildVideoGridTaskParams} from '@shared/videoPreview'
import {getMediaDeleteAssetFolder, isImageMediaType, isVideoMediaType} from '@/utils/mediaType'
import {
  finalizeReviewGridGenerate,
  getReviewGridStatus,
  isAnyReviewGridBusy,
  reviewGridStatusVersion,
  runExclusiveGridGenerate,
  setReviewGridStatus,
  waitForReviewGridReady,
} from '@/utils/reviewModeGridPrefetch'
import type {MediaItem} from '@/types/stores'
import type {MediaType} from '@/types/media'

const props = defineProps<{
  media: MediaItem | null
  mediaPath: string
  mediaType: MediaType | null
}>()

const emit = defineEmits<{
  playFull: []
}>()

const {t} = useI18n()
const itemsStore = useItemsStore()
const settingsStore = useSettingsStore()

const tileIndexes = GRID_FRAME_INDEXES
const activeTile = ref(0)
/** Tile clips only after hover/focus — avoids auto-downloading a stream for every item. */
const clipArmed = ref(false)
/** Same gate as card hover: codecs that need live/transcode show notice, no clip. */
const previewUnavailable = ref(false)
const gridReady = ref(false)
const gridChecking = ref(false)
const generatingGrid = ref(false)
const gridError = ref('')
const gridCacheBust = ref(0)
const clipUrl = ref<string | null>(null)
const clipWindow = ref<ReviewTileClipWindow | null>(null)
/** Fade video in only after a seeked frame is ready (sprite stays underneath). */
const clipVisible = ref(false)
const videoEl = ref<HTMLVideoElement | null>(null)
/** Mid-file direct preview while createGrid runs (no live/ffmpeg). */
const waitingUrl = ref<string | null>(null)
const waitingVisible = ref(false)
const waitingVideoEl = ref<HTMLVideoElement | null>(null)
let clipToken = 0
let probeToken = 0
let playableToken = 0
let genToken = 0
let waitingToken = 0
let clipLoadTimer: ReturnType<typeof setTimeout> | null = null
let leaveStopTimer: ReturnType<typeof setTimeout> | null = null
/** Stable direct URL per media — seek in-place instead of live FFmpeg chunks. */
let directClipUrlForMediaId: number | null = null
let directClipUrl: string | null = null

const CLIP_FADE_MS = 320
/** Ignore brief leave while crossing the 4px gaps between tiles. */
const LEAVE_STOP_PREVIEWS_MS = 200

function isHoverTranscodeEnabled() {
  return settingsStore.transcodeUnsupportedFormats === '1'
}

function setWaitingVideoRef(el: unknown) {
  waitingVideoEl.value = (el as HTMLVideoElement | null) || null
}

function midPreviewStartSec(): number {
  const duration = durationSec.value
  if (!Number.isFinite(duration) || duration <= 0) return 0
  return Math.max(0, Math.floor(duration / 2))
}

function stopWaitingPreview() {
  waitingToken += 1
  waitingVisible.value = false
  const el = waitingVideoEl.value
  waitingVideoEl.value = null
  waitingUrl.value = null
  hardStopVideo(el)
}

async function startWaitingPreview() {
  const item = props.media
  if (!item?.id || !isVideo.value || previewUnavailable.value) return
  if (!generatingGrid.value || gridReady.value) return

  const token = ++waitingToken
  const start = midPreviewStartSec()
  const url = directClipSrc(item.id)
  waitingVisible.value = false
  waitingUrl.value = url
  await nextTick()
  if (token !== waitingToken || !generatingGrid.value || gridReady.value) {
    // Superseded or grid finished while we were mounting — never leave a stray stream.
    if (token === waitingToken) stopWaitingPreview()
    return
  }
  const el = waitingVideoEl.value
  if (!el) return

  await waitForClipMetadata(el)
  if (token !== waitingToken || !generatingGrid.value || gridReady.value) {
    if (token === waitingToken) stopWaitingPreview()
    return
  }
  await waitForClipSeek(el, start)
  if (token !== waitingToken || !generatingGrid.value || gridReady.value) {
    if (token === waitingToken) stopWaitingPreview()
    return
  }
  try {
    await el.play()
  } catch {
    // ignore
  }
  if (token !== waitingToken || !generatingGrid.value || gridReady.value) {
    if (token === waitingToken) stopWaitingPreview()
    return
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (token !== waitingToken || !generatingGrid.value || gridReady.value) {
        if (token === waitingToken) stopWaitingPreview()
        return
      }
      if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        waitingVisible.value = true
      }
    })
  })
}

function onWaitingError() {
  // Keep thumb + progress; do not mark format unavailable during generate.
  stopWaitingPreview()
}

function cancelLeaveStopPreviews() {
  if (!leaveStopTimer) return
  clearTimeout(leaveStopTimer)
  leaveStopTimer = null
}

function stopAllPreviews() {
  cancelLeaveStopPreviews()
  clipArmed.value = false
  stopClip()
}

function scheduleLeaveStopPreviews() {
  cancelLeaveStopPreviews()
  if (!clipArmed.value && !clipUrl.value) return
  leaveStopTimer = setTimeout(() => {
    leaveStopTimer = null
    stopAllPreviews()
  }, LEAVE_STOP_PREVIEWS_MS)
}

function onGridFocusOut(event: FocusEvent) {
  const root = event.currentTarget as HTMLElement | null
  const next = event.relatedTarget as Node | null
  if (root && next && root.contains(next)) return
  scheduleLeaveStopPreviews()
}

function markPreviewUnavailable(mediaId: number) {
  previewUnavailable.value = true
  markHoverPreviewUnavailableCached(mediaId)
  stopWaitingPreview()
  stopAllPreviews()
}

function setVideoRef(el: unknown) {
  videoEl.value = (el as HTMLVideoElement | null) || null
}

function hardStopVideo(el: HTMLVideoElement | null | undefined) {
  if (!el) return
  try {
    el.pause()
    el.removeAttribute('src')
    el.load()
  } catch {
    // ignore
  }
}

function gridFilePath(mediaId: number): string {
  return path.join(props.mediaPath, 'videos', 'grids', `${mediaId}.jpg`)
}

function isGridAlreadyExistsError(error: unknown): boolean {
  const err = error as {response?: {data?: {message?: string}}; message?: string} | null
  const message = String(err?.response?.data?.message || err?.message || error || '')
  return /already exists/i.test(message)
}

const isVideo = computed(() => isVideoMediaType(props.mediaType))
const isImage = computed(() => isImageMediaType(props.mediaType))

const assetFolder = computed(() => getMediaDeleteAssetFolder(props.mediaType) || 'videos')

const thumbUrl = computed(() => {
  const item = props.media
  if (!item?.id || !props.mediaPath) return null
  return resolveMediaThumbDisplayUrl(props.mediaPath, assetFolder.value, item.id)
})

/** Images: original file. Other non-video: library thumb. */
const stillUrl = computed(() => {
  const item = props.media
  if (!item?.id) return null
  if (isImage.value && item.path) {
    return buildLocalFileUrl(item.path, true)
  }
  return thumbUrl.value
})

const gridUrl = computed(() => {
  const item = props.media
  if (!item?.id || !props.mediaPath || !isVideo.value) return null
  // Build from disk path — do not reuse card thumb-display cache (can be stale/missing).
  return buildLocalFileUrl(
    gridFilePath(item.id),
    false,
    gridCacheBust.value > 0 ? gridCacheBust.value : false,
  )
})

const tileStyles = computed(() => {
  const url = gridUrl.value
  if (!url) return [] as Array<Record<string, string>>
  return tileIndexes.map((index) => buildGridSpriteBackgroundStyle(url, index))
})

/** Match sprite tile AR to the file so crops are not stretched vs the trailer. */
const mediaAspectRatio = computed(() =>
  getMediaAspectRatio(props.media ?? {}, PREVIEW_CONTAINER_ASPECT_RATIO),
)

const gridStageStyle = computed(() => {
  const ar = mediaAspectRatio.value
  return {
    // Cap by height without widening past the media aspect (avoids horizontal stretch).
    width: `min(100%, calc(min(58vh, 680px) * ${ar}))`,
  }
})

const canGenerateGrid = computed(() => Boolean(props.media?.path && props.media?.id))

const showGridProgress = computed(() => gridChecking.value || generatingGrid.value)

/** Block tile live-clips while any createGrid holds ffmpeg or format needs transcode. */
const clipsAllowed = computed(() => {
  void reviewGridStatusVersion.value
  return (
    gridReady.value &&
    !previewUnavailable.value &&
    !generatingGrid.value &&
    !isAnyReviewGridBusy()
  )
})

const durationSec = computed(() => Number(props.media?.duration) || 0)

function setActiveTile(index: number) {
  if (previewUnavailable.value) {
    activeTile.value = index
    return
  }
  if (!clipArmed.value) clipArmed.value = true
  if (activeTile.value === index) return
  // Hide before remount so the new tile never flashes a stale frame.
  clipVisible.value = false
  clipToken += 1
  activeTile.value = index
}

function waitForClipSeek(el: HTMLVideoElement, start: number): Promise<void> {
  return new Promise((resolve) => {
    if (!shouldApplyPreviewSeek(el.currentTime, start)) {
      resolve()
      return
    }
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      el.removeEventListener('seeked', finish)
      resolve()
    }
    const timeoutId = window.setTimeout(finish, 2_000)
    el.addEventListener('seeked', finish)
    try {
      el.currentTime = start
    } catch {
      finish()
    }
  })
}

function waitForClipMetadata(el: HTMLVideoElement): Promise<void> {
  if (el.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeoutId)
      el.removeEventListener('loadedmetadata', finish)
      resolve()
    }
    const timeoutId = window.setTimeout(finish, 2_000)
    el.addEventListener('loadedmetadata', finish)
  })
}

async function seekAndPlayClip(el: HTMLVideoElement, start: number, token = clipToken) {
  clipVisible.value = false
  await waitForClipMetadata(el)
  if (token !== clipToken) return
  await waitForClipSeek(el, start)
  if (token !== clipToken) return
  try {
    await el.play()
  } catch {
    // ignore autoplay failures
  }
  if (token !== clipToken) return

  const reveal = () => {
    if (token !== clipToken) return
    clipVisible.value = true
  }
  if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    requestAnimationFrame(() => requestAnimationFrame(reveal))
    return
  }
  const onReady = () => {
    el.removeEventListener('loadeddata', onReady)
    requestAnimationFrame(() => requestAnimationFrame(reveal))
  }
  el.addEventListener('loadeddata', onReady)
}

function directClipSrc(mediaId: number): string {
  if (directClipUrlForMediaId === mediaId && directClipUrl) return directClipUrl
  directClipUrlForMediaId = mediaId
  directClipUrl = buildVideoStreamUrl(buildApiUrl, mediaId, 'direct', {bustCache: false})
  return directClipUrl
}

async function loadClipForTile(tileIndex: number) {
  const token = ++clipToken
  const item = props.media
  clipVisible.value = false
  if (!item?.id || !isVideo.value || !gridReady.value || !clipArmed.value) return
  if (!clipsAllowed.value) return

  const window = reviewTileClipWindow(durationSec.value || 1, tileIndex)
  if (!window) return
  clipWindow.value = window

  // Direct only — never start /transcode/stream for review tile clips.
  const url = directClipSrc(item.id)
  if (token !== clipToken || !clipsAllowed.value) return
  clipUrl.value = url
  await nextTick()
  if (token !== clipToken || !clipsAllowed.value) return
  const el = videoEl.value
  if (!el) return
  await seekAndPlayClip(el, window.start, token)
}

function scheduleClipLoad(tileIndex: number) {
  if (clipLoadTimer) clearTimeout(clipLoadTimer)
  clipLoadTimer = setTimeout(() => {
    clipLoadTimer = null
    void loadClipForTile(tileIndex)
  }, 140)
}

function onClipTimeUpdate(event: Event) {
  const el = event.target as HTMLVideoElement
  const window = clipWindow.value
  if (!el || !window || !clipUrl.value) return
  if (!shouldRestartFixedPreviewClip({
    previewStartTime: window.start,
    previewEndTime: window.end,
    playbackTime: el.currentTime,
  })) {
    return
  }
  // Loop restart: keep visible, just seek (no fade flicker).
  if (shouldApplyPreviewSeek(el.currentTime, window.start)) {
    try {
      el.currentTime = window.start
    } catch {
      // ignore
    }
  }
  void el.play().catch(() => undefined)
}

function onClipError() {
  const mediaId = props.media?.id
  if (!mediaId || previewUnavailable.value) return
  // Same end-state as card hover when direct decode fails (no live fallback here).
  markPreviewUnavailable(mediaId)
}

function stopClip() {
  clipToken += 1
  clipVisible.value = false
  if (clipLoadTimer) {
    clearTimeout(clipLoadTimer)
    clipLoadTimer = null
  }
  const el = videoEl.value
  videoEl.value = null
  // Clear src after leave fade so the last frame can crossfade back to the sprite.
  clipUrl.value = null
  clipWindow.value = null
  window.setTimeout(() => hardStopVideo(el), CLIP_FADE_MS + 40)
}

async function probePreviewAvailability() {
  const token = ++playableToken
  const mediaId = props.media?.id
  previewUnavailable.value = false
  if (!isVideo.value || !mediaId) return

  // Same cache the card grid uses after a failed hover preview.
  if (isHoverPreviewUnavailableCached(mediaId)) {
    markPreviewUnavailable(mediaId)
    return
  }

  try {
    const playable = await fetchPlayableInfo(mediaId)
    if (token !== playableToken || props.media?.id !== mediaId) return
    const playability = playable.playability as {
      playable?: boolean
      needsRemux?: boolean
    } | undefined
    // Exact same gate as card hover (`useHoverPreviewPlayback` / beginHoverPlayableGate).
    // Remux / container_layout stay playable via direct — do not pre-block those.
    const plan = resolveHoverPreviewSourcePlan({
      mode: playable.mode,
      transcodeRequired: playable.transcodeRequired,
      streamPlayback: playable.streamPlayback,
      reason: playable.reason,
      playability,
      transcodeEnabled: isHoverTranscodeEnabled(),
    })
    if (plan.kind === 'unavailable') {
      markPreviewUnavailable(mediaId)
    }
  } catch {
    // Probe failed — same as cards: keep direct-only attempt, no live FFmpeg.
    if (token !== playableToken) return
  }
}

function onTileClick(index: number) {
  if (activeTile.value !== index || !clipArmed.value) {
    setActiveTile(index)
    return
  }
  // Second click on the active tile opens the full player.
  emit('playFull')
}

async function probeGridExists(fresh = true): Promise<boolean> {
  const item = props.media
  if (!item?.id || !props.mediaPath) return false
  const filePath = gridFilePath(item.id)
  if (fresh) invalidateFileExistsCache(filePath)
  try {
    return await checkFileExists(filePath)
  } catch {
    return false
  }
}

function markGridReady() {
  const item = props.media
  if (!item?.id) return
  // Stop mid-preview before flipping to the sprite grid.
  stopWaitingPreview()
  generatingGrid.value = false
  setReviewGridStatus(item.id, 'ready')
  invalidateFileExistsCache(gridFilePath(item.id))
  invalidateVideoThumbCaches(item.id)
  itemsStore.refreshThumb(item.id, {broadcast: false})
  gridCacheBust.value = Date.now()
  gridReady.value = true
  gridError.value = ''
  activeTile.value = 0
  clipArmed.value = false
  stopClip()
}

async function refreshGridPresence() {
  const token = ++probeToken
  genToken += 1
  generatingGrid.value = false
  if (!isVideo.value) {
    gridReady.value = false
    gridChecking.value = false
    return
  }

  const mediaId = props.media?.id
  const cached = mediaId ? getReviewGridStatus(mediaId) : 'unknown'

  // Instant path when neighbors/current were already probed or warm-generated.
  if (cached === 'ready' && mediaId) {
    gridChecking.value = false
    gridError.value = ''
    gridReady.value = true
    gridCacheBust.value = Date.now()
    clipArmed.value = false
    stopClip()
    return
  }

  if (cached === 'generating' && mediaId) {
    gridChecking.value = false
    gridReady.value = false
    gridError.value = ''
    generatingGrid.value = true
    const ready = await waitForReviewGridReady(mediaId, 90_000)
    if (token !== probeToken || props.media?.id !== mediaId) return
    generatingGrid.value = false
    stopWaitingPreview()
    if (ready) {
      markGridReady()
      return
    }
    // Timed out / failed — fall through to disk probe + optional retry.
  }

  gridChecking.value = true
  gridReady.value = false
  gridError.value = ''
  try {
    const exists = await probeGridExists(true)
    if (token !== probeToken) return
    if (mediaId) setReviewGridStatus(mediaId, exists ? 'ready' : 'missing')
    gridReady.value = exists
    if (exists) {
      markGridReady()
      return
    }
    if (canGenerateGrid.value) {
      gridChecking.value = false
      void generateGrid()
      return
    }
  } finally {
    if (token === probeToken) gridChecking.value = false
  }
}

async function generateGrid(_options: {manual?: boolean} = {}) {
  const item = props.media
  if (!item?.id || !item.path || generatingGrid.value) return
  const mediaId = item.id
  const mediaPath = props.mediaPath
  const token = ++genToken
  generatingGrid.value = true
  gridError.value = ''
  setReviewGridStatus(mediaId, 'generating')

  let createFinished = false
  let createError: unknown = null
  const createDone = runExclusiveGridGenerate(async () => {
    try {
      await typedApi.taskCreateGrid(
        buildVideoGridTaskParams(item.path!, `${item.id}.jpg`),
      )
    } catch (error) {
      if (!isGridAlreadyExistsError(error)) throw error
    }
  }).then(() => {
    createFinished = true
    // Even if the user already navigated away, clear stuck "generating".
    void finalizeReviewGridGenerate(mediaId, mediaPath, 'success')
  }).catch((error) => {
    createFinished = true
    createError = error
    void finalizeReviewGridGenerate(mediaId, mediaPath, 'failed')
  })

  try {
    const started = Date.now()
    let poll = 0
    while (token === genToken && props.media?.id === mediaId && Date.now() - started < 90_000) {
      if (getReviewGridStatus(mediaId) === 'ready' || await probeGridExists(poll === 0 || createFinished || poll % 3 === 0)) {
        markGridReady()
        return
      }
      if (createFinished) break
      poll += 1
      await new Promise((resolve) => setTimeout(resolve, 900))
    }

    if (token !== genToken || props.media?.id !== mediaId) return

    if (!createFinished) {
      // Soft-fail UI now; createDone may still succeed later via finalizeReviewGridGenerate.
      setReviewGridStatus(mediaId, 'missing')
      stopWaitingPreview()
      gridError.value = t('review_mode.generate_grid_failed')
      return
    }

    await createDone
    if (token !== genToken || props.media?.id !== mediaId) return

    gridCacheBust.value = Date.now()
    if (getReviewGridStatus(mediaId) === 'ready' || await probeGridExists(true)) {
      markGridReady()
      return
    }

    if (createError) console.error(createError)
    setReviewGridStatus(mediaId, 'missing')
    stopWaitingPreview()
    gridError.value = t('review_mode.generate_grid_failed')
  } finally {
    void createDone
    if (token === genToken) {
      generatingGrid.value = false
      stopWaitingPreview()
    }
  }
}

watch(
  () => [props.media?.id, props.mediaPath, isVideo.value] as const,
  async () => {
    stopWaitingPreview()
    stopAllPreviews()
    activeTile.value = 0
    gridCacheBust.value = 0
    directClipUrlForMediaId = null
    directClipUrl = null
    // Playability first — same gate as card hover preview.
    void probePreviewAvailability()
    await refreshGridPresence()
  },
  {immediate: true},
)

watch(
  () => [generatingGrid.value, gridReady.value, previewUnavailable.value, props.media?.id] as const,
  () => {
    // Mid-preview only while this item's grid is generating — stop as soon as ready.
    if (
      generatingGrid.value &&
      !gridReady.value &&
      !previewUnavailable.value &&
      props.media?.id
    ) {
      void startWaitingPreview()
      return
    }
    stopWaitingPreview()
  },
)

// createGrid may finish after the UI soft-timeout — pick up ready status without remount.
watch(
  () => [props.media?.id, reviewGridStatusVersion.value] as const,
  () => {
    const id = props.media?.id
    if (!id || !isVideo.value || gridReady.value) return
    if (getReviewGridStatus(id) === 'ready') markGridReady()
  },
)

watch(
  () => [activeTile.value, gridReady.value, clipArmed.value, clipsAllowed.value, props.media?.id] as const,
  () => {
    if (!gridReady.value || !clipArmed.value || !clipsAllowed.value) {
      stopClip()
      return
    }
    scheduleClipLoad(activeTile.value)
  },
)

onBeforeUnmount(() => {
  stopWaitingPreview()
  stopAllPreviews()
})
</script>

<style scoped>
.review-stage-media {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.review-stage-media__grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: auto;
  gap: 4px;
  max-width: 100%;
  height: auto;
  margin-inline: auto;
  /* Keep grid flush — no outer radius that would crop corner tiles. */
  border-radius: 0;
  overflow: visible;
}

.review-stage-media__preview-unavailable {
  position: absolute;
  left: 50%;
  bottom: 12px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: max-content;
  max-width: calc(100% - 24px);
  padding: 10px 14px;
  border-radius: 12px;
  transform: translateX(-50%);
  background: rgba(11, 11, 11, 0.82);
  color: #e16363;
  text-align: center;
  font-size: 12px;
  line-height: 1.35;
  font-weight: 500;
  pointer-events: none;
}

.review-stage-media__preview-unavailable-icon {
  flex-shrink: 0;
}

.review-stage-media__tile {
  position: relative;
  margin: 0;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  background-color: rgba(255, 255, 255, 0.04);
  min-height: 0;
  isolation: isolate;
  /* Same AR as the source / grid JPEG tiles — no horizontal stretch. */
  aspect-ratio: var(--review-ar, 16 / 9);
}

.review-stage-media__tile--active {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 1px rgba(var(--v-theme-primary), 0.45);
  z-index: 1;
}

.review-stage-media__tile-sprite {
  position: absolute;
  inset: 0;
  background-color: #000;
  /* Slight zoom crops subpixel sprite seams; keep uniform (no stretch). */
  transform: scale(1.02);
  transform-origin: center;
  backface-visibility: hidden;
  pointer-events: none;
}

.review-stage-media__clip {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: transparent;
  opacity: 0;
  pointer-events: none;
  /* Match sprite zoom so the first trailer frame aligns with the crop. */
  transform: scale(1.02);
  transform-origin: center;
}

.review-stage-media__clip--visible {
  opacity: 1;
  transition: opacity 320ms ease;
}

.review-clip-leave-active {
  transition: opacity 280ms ease;
}

.review-clip-leave-to {
  opacity: 0;
}

.review-stage-media__tile-badge {
  position: absolute;
  left: 6px;
  bottom: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.7);
  font-size: 0.7rem;
  pointer-events: none;
  opacity: 0;
  transition: opacity 240ms ease;
}

.review-stage-media__tile-badge--visible {
  opacity: 1;
}

.review-stage-media__fallback,
.review-stage-media__thumb {
  width: min(100%, calc(min(58vh, 680px) * var(--review-ar, 1.777)));
  height: auto;
  aspect-ratio: var(--review-ar, 16 / 9);
  max-height: min(58vh, 680px);
  margin-inline: auto;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
}

.review-stage-media__image {
  display: block;
  max-width: min(100%, 72vw);
  max-height: min(58vh, 680px);
  width: auto;
  height: auto;
  margin-inline: auto;
  border-radius: 16px;
  object-fit: contain;
}

.review-stage-media__fallback {
  position: relative;
}

.review-stage-media__waiting-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
  opacity: 0;
  transition: opacity 320ms ease;
  cursor: pointer;
}

.review-stage-media__waiting-video--visible {
  opacity: 1;
}

.review-stage-media__thumb--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.55;
}

.review-stage-media__fallback-actions {
  position: absolute;
  left: 50%;
  bottom: 16px;
  z-index: 2;
  transform: translateX(-50%);
  text-align: center;
  max-width: min(90%, 360px);
}

.review-stage-media__progress {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 16px;
  z-index: 2;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.72);
  backdrop-filter: blur(6px);
}

.review-stage-media__progress-label {
  margin-bottom: 8px;
  text-align: center;
  opacity: 0.9;
}
</style>
